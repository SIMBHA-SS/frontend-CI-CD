// Single facade for telemetry: components call obs.*, never a vendor SDK, so
// swapping or adding a tool (Sentry, Datadog, OTel) touches one file.
// Import order matters: both SDKs must init before the app renders.
import './datadog'
import './sentry'
import * as Sentry from '@sentry/react'
import { datadogRum } from '@datadog/browser-rum'
import { RUM_ENABLED } from './datadog'
import { SENTRY_ENABLED } from './sentry'

type ErrorContext = { feature?: string; endpoint?: string; [key: string]: unknown }

export const obs = {
  /** Business/UI event: RUM action in Datadog, breadcrumb in Sentry. */
  action(name: string, context?: Record<string, unknown>) {
    if (RUM_ENABLED) datadogRum.addAction(name, context)
    if (SENTRY_ENABLED) Sentry.addBreadcrumb({ category: 'ui.action', message: name, data: context })
  },

  /** A handled error we still want to know about. */
  error(error: unknown, context: ErrorContext = {}) {
    if (RUM_ENABLED) datadogRum.addError(error, context)
    if (SENTRY_ENABLED) {
      Sentry.withScope((scope) => {
        if (context.feature) scope.setTag('feature', context.feature)
        if (context.endpoint) {
          scope.setTag('endpoint', context.endpoint)
          // Custom grouping: one issue per endpoint, not one per status/message,
          // so "HTTP 503" and "HTTP 502" on /api/flaky don't become separate issues.
          scope.setFingerprint(['api-error', context.endpoint])
        }
        scope.setContext('details', context)
        Sentry.captureException(error)
      })
    }
  },

  /** Custom timing on the current view (Datadog only: perf lives there). */
  timing(name: string) {
    if (RUM_ENABLED) datadogRum.addTiming(name)
  },
}
