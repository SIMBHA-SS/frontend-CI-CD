variable "env" {
  description = "Deployment environment tag (local, staging, prod)"
  type        = string
  default     = "local"
}

variable "dd_site" {
  description = "Datadog site, e.g. datadoghq.com or datadoghq.eu"
  type        = string
  default     = "datadoghq.com"
}

variable "notify_page" {
  description = "Who gets paged for urgent alerts (prod only)"
  type        = string
  default     = "@pagerduty-frontend-oncall @slack-frontend-incidents"
}

variable "notify_ticket" {
  description = "Where non-urgent alerts go"
  type        = string
  default     = "@slack-frontend-alerts"
}

variable "runbook_base_url" {
  description = "Base URL of the runbooks folder"
  type        = string
  default     = "https://github.com/<you>/fre-practice/blob/main/notes/runbooks"
}
