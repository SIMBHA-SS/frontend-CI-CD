# Datadog "reliability as code" for depot-observability-ui.
# The same RUM metrics, SLO and monitors we built by hand in the UI, as
# reviewable, versioned code. Changes go through a PR, `terraform plan` shows
# the diff, and every environment gets an identical setup.
#
#   export DD_API_KEY=... DD_APP_KEY=...   # APP key: Org Settings > Application Keys
#   terraform init && terraform plan -var env=local
#
# Reference file for interview prep: run `terraform plan` before trusting any
# query syntax, and don't `apply` over the resources you created in the UI
# (you'd get duplicates; `terraform import` adopts existing ones instead).

terraform {
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.60"
    }
  }
}

provider "datadog" {
  # Reads DD_API_KEY / DD_APP_KEY from the environment; never hard-code keys.
  api_url = "https://api.${var.dd_site}/"
}

locals {
  service = "depot-observability-ui"
  tags    = ["team:frontend-reliability", "service:${local.service}", "env:${var.env}", "managed-by:terraform"]
  lcp_good_ns = 2500000000 # RUM durations are nanoseconds: 2.5 s

  # Severity routing (see notes/02b-production-datadog.md, "On-call routing")
  page   = var.env == "prod" ? var.notify_page : var.notify_ticket
  ticket = var.notify_ticket
}

# ---------------------------------------------------------------------------
# 1. RUM-generated metrics (15-month retention, cheap to query)
# ---------------------------------------------------------------------------
resource "datadog_rum_metric" "lcp_good" {
  name       = "rum.views.lcp_good"
  event_type = "view"
  compute { aggregation_type = "count" }
  filter {
    query = "@view.loading_type:initial_load @view.largest_contentful_paint:<${local.lcp_good_ns}"
  }
  group_by {
    path     = "@view.name"
    tag_name = "view_name"
  }
  group_by {
    path     = "version"
    tag_name = "version"
  }
}

resource "datadog_rum_metric" "lcp_total" {
  name       = "rum.views.lcp_total"
  event_type = "view"
  compute { aggregation_type = "count" }
  filter {
    query = "@view.loading_type:initial_load @view.largest_contentful_paint:*"
  }
  group_by {
    path     = "@view.name"
    tag_name = "view_name"
  }
  group_by {
    path     = "version"
    tag_name = "version"
  }
}

# ---------------------------------------------------------------------------
# 2. SLO: % of initial loads with LCP < 2.5 s
#    API/Terraform uses numerator (good) / denominator (total); the UI's
#    "bad events" box is just a presentation of total - good.
# ---------------------------------------------------------------------------
resource "datadog_service_level_objective" "lcp" {
  name        = "Dashboard initial load: LCP < 2.5s (${var.env})"
  type        = "metric"
  description = <<-EOT
    **What:** % of initial page loads with LCP < 2.5s (Core Web Vitals "good").
    **Why:** slow first load = users abandon the observability UI.
    **Owner:** frontend-reliability. **Runbook:** ${var.runbook_base_url}/lcp-slo-burn.md
  EOT

  query {
    numerator   = "sum:rum.views.lcp_good{env:${var.env}}.as_count()"
    denominator = "sum:rum.views.lcp_total{env:${var.env}}.as_count()"
  }

  thresholds {
    timeframe = "30d"
    target    = 95
    warning   = 97
  }

  tags = local.tags
}

# ---------------------------------------------------------------------------
# 3. Multi-window, multi-burn-rate alerts (Google SRE workbook)
# ---------------------------------------------------------------------------
locals {
  burn_tiers = {
    fast = { long = "1h", short = "5m", rate = 14.4, notify = local.page, label = "PAGE" }
    slow = { long = "6h", short = "30m", rate = 6, notify = local.page, label = "PAGE" }
    leak = { long = "3d", short = "6h", rate = 1, notify = local.ticket, label = "TICKET" }
  }
}

resource "datadog_monitor" "lcp_burn" {
  for_each = local.burn_tiers

  name = "[${each.value.label}] LCP SLO burning ${each.value.rate}x over ${each.value.long} (${var.env})"
  type = "slo alert"
  query = "burn_rate(\"${datadog_service_level_objective.lcp.id}\").over(\"30d\").long_window(\"${each.value.long}\").short_window(\"${each.value.short}\") > ${each.value.rate}"

  message = <<-EOT
    {{#is_alert}}LCP SLO burning at {{value}}x (threshold ${each.value.rate}x over ${each.value.long}).{{/is_alert}}
    {{#is_recovery}}LCP SLO burn rate back to normal.{{/is_recovery}}
    Runbook: ${var.runbook_base_url}/lcp-slo-burn.md
    ${each.value.notify}
  EOT

  monitor_thresholds { critical = each.value.rate }
  tags = concat(local.tags, ["slo:lcp", "tier:${each.key}"])
}

# ---------------------------------------------------------------------------
# 4. Regression monitors (fire per release, so the culprit deploy is obvious)
# ---------------------------------------------------------------------------
resource "datadog_monitor" "lcp_regression_by_version" {
  name    = "[TICKET] p75 LCP > 2.5s on {{version.name}} (${var.env})"
  type    = "rum alert"
  query   = "rum(\"@type:view @view.loading_type:initial_load service:${local.service} env:${var.env}\").rollup(\"pc75\", \"@view.largest_contentful_paint\").by(\"version\").last(\"30m\") > ${local.lcp_good_ns}"
  message = <<-EOT
    p75 LCP for version {{version.name}} is {{value}} ns (> 2.5 s).
    Compare with the previous version in RUM; if it's the latest deploy, consider rollback.
    Runbook: ${var.runbook_base_url}/lcp-slo-burn.md
    ${local.ticket}
  EOT
  monitor_thresholds { critical = local.lcp_good_ns }
  tags = concat(local.tags, ["signal:web-vitals"])
}

resource "datadog_monitor" "js_error_spike" {
  name    = "[PAGE] JS error spike on {{version.name}} (${var.env})"
  type    = "rum alert"
  query   = "rum(\"@type:error @error.source:source service:${local.service} env:${var.env}\").rollup(\"count\").by(\"version\").last(\"5m\") > 50"
  message = <<-EOT
    {{value}} JS errors in 5 min on version {{version.name}}.
    Check Error Tracking for the top new issue; a ChunkLoadError right after a deploy usually means
    index.html is cached with stale chunk names (CDN cache headers).
    ${local.page}
  EOT
  monitor_thresholds {
    critical = 50
    warning  = 20
  }
  # Low-traffic hours: don't page on no data, and re-notify while still broken.
  notify_no_data      = false
  renotify_interval   = 30
  require_full_window = false
  tags                = concat(local.tags, ["signal:errors"])
}
