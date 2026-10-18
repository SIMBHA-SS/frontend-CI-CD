# Phase 2b: Making the Datadog setup production-grade

## Part 1: Hands-on in the Datadog UI (about 45 min)

### 1. Error-spike monitor (10 min)
**Monitors → New Monitor → Real User Monitoring**
- Query: `@type:error @error.source:source service:depot-observability-ui env:local`
- Measure: **count**, group by **`version`**
- Evaluate over the **last 5 minutes**. Alert **> 50**, Warn **> 20** (for practice set **Alert > 5, Warn > 2** so you can trigger it)
- Name: `[PAGE] JS error spike on {{version.name}} (local)`
- Message: what it means + `@your-email`
- **Test it:** Chaos Lab → click "Unhandled promise rejection" 6 times within 5 minutes. Watch the alert fire, then recover.

> `@error.source:source` = errors thrown by *our* JS. Other sources are `network`, `console`, `report` (CSP etc). Filtering avoids paging on, for example, failed 3rd-party pixels.

### 2. Core Web Vitals regression monitor by version (10 min)
**Monitors → New Monitor → Real User Monitoring**
- Query: `@type:view @view.loading_type:initial_load service:depot-observability-ui`
- Measure: **75th percentile (p75) of `@view.largest_contentful_paint`**, group by **`version`**
- Last **30 minutes**, alert **> 2.5s**
- **Why by version?** Each release becomes its own alert group, so `{{version.name}}` in the message tells on-call *which deploy* regressed.

### 3. SLO + reliability dashboard (20 min)
**Dashboards → New Dashboard** → name `DEPOT UI Reliability`. Add widgets:

| Widget | Config | Why |
|---|---|---|
| **SLO** widget | your LCP SLO, show 7d + 30d, error budget | Headline for error-budget reviews |
| **Timeseries** | RUM, `@type:view initial_load`, pc75 LCP, **by version** | Spot release regressions |
| **Query value** ×3 | p75 LCP, p75 INP (`@view.interaction_to_next_paint`), p75 CLS (`@view.cumulative_layout_shift`) | The three Core Web Vitals at a glance |
| **Top list** | RUM `@type:error`, count by `@issue.id` or `@error.message` | Top errors |
| **Top list** | RUM `@type:resource`, p95 `@resource.duration` by `@resource.url_path` | Slowest APIs and assets |
| **Timeseries** | RUM `@type:resource @resource.type:fetch`, count by `@resource.status_code` | API health from the browser |
| **Monitor summary** | tag `team:frontend-reliability` | What's firing right now |

Add a **template variable** `env` (and `version`) at the top so one dashboard serves local, staging and prod.

### 4. Upload source maps once (10 min)
```powershell
cd web
$env:VITE_APP_VERSION="1.0.0"
npm run build
$env:DATADOG_API_KEY="<api key>"
npm run sourcemaps:upload        # uploads, then deletes .map files from dist/
npm run preview                  # http://localhost:4173 (api must be running)
```
Trigger **Render crash** → Datadog **Error Tracking** → the stack trace now shows `Chaos.tsx:13` instead of `index-F8KM.js:1:48213`.
Why delete maps after upload? Shipping them exposes your source code, and they waste CDN bandwidth.

## Part 2: SLOs and monitors as code ([infra/datadog/](../infra/datadog/))

[main.tf](../infra/datadog/main.tf) recreates everything we clicked, plus the parts we skipped:
- 2 RUM metrics → 1 SLO → **3 burn-rate tiers** (14.4×/1h page, 6×/6h page, 1×/3d ticket) via `for_each`
- LCP regression monitor and error-spike monitor, grouped by `version`
- `env` variable, so the **same code produces identical local/staging/prod** setups
- Routing: **paging only in prod**; other environments go to Slack

**Why "as code"? (interview answer)**
1. **Review:** monitor changes go through PRs; `terraform plan` shows the diff.
2. **Consistency:** every environment and service gets the same standards. No snowflake monitors.
3. **History and rollback:** git blame says why a threshold changed.
4. **Recovery:** if a monitor is deleted in the UI, `apply` restores it.
5. **Scale:** a module per frontend app gives each team a standard SLO pack.
Adopt UI-created resources with `terraform import` rather than recreating them.

## Part 3: On-call routing design

### Severity → routing
| Severity | Example signal | Route | Response |
|---|---|---|---|
| **SEV1/2 → Page** | Fast/slow burn (14.4×, 6×), JS error spike in prod, Synthetics login check failing from 2+ locations | PagerDuty / Datadog On-Call → frontend on-call, plus `#frontend-incidents` | Ack in 5 min, 24/7 |
| **SEV3 → Ticket** | 1×/3d burn, LCP regression on one version, CLS creeping up | `#frontend-alerts` + auto-created Jira | Next business day |
| **Info** | Error budget < 50%, new error type | Weekly report / error-budget review | Review meeting |

**Escalation:** primary on-call → (15 min no ack) secondary → (30 min) frontend lead → platform on-call for CDN or infra.

### Alert hygiene rules (the "standards" the JD mentions)
- **Every page is actionable** and links a runbook. If on-call can't act on it, it becomes a ticket, not a page.
- **Alert on symptoms (SLO burn), not causes** (CPU, a single 500). Cause signals go on dashboards.
- Every monitor has **owner and service tags**, a **runbook link**, and **`{{version.name}}`** in the message.
- `notify_no_data: false` for traffic-based monitors (quiet nights ≠ outage). Use **Synthetics** for "is it up".
- `renotify_interval` so an ongoing problem isn't forgotten.
- **Downtimes** during planned maintenance. **Review noisy alerts monthly**: anything that fired without action gets tuned or deleted.

## Interview Q&A

**Q: How do you avoid alert fatigue?**
"Page only on SLO burn rate, which maps to user impact. Everything else is a ticket or a dashboard. Each page has a runbook and an owner. We review alerts monthly and delete or tune anything that fired without anyone acting on it."

**Q: How do you manage monitors across many teams and environments?**
"Terraform modules: a standard SLO and monitor pack per frontend, parameterized by env and service, reviewed in PRs. Prod pages; staging goes to Slack."

**Q: A deploy went out and errors spiked. How do you know it was the deploy?**
"Every RUM event carries `version` (the git SHA set at build time). Monitors group by version, so the alert names the release. Error Tracking shows *first seen in version X*. Source maps for that version give exact file:line."

**Q: What's in a good runbook?**
"What the alert means and its impact, how to confirm, a triage table ordered by likelihood, mitigation steps (rollback first), how to verify recovery, and when to escalate. See [runbooks/lcp-slo-burn.md](runbooks/lcp-slo-burn.md)."
