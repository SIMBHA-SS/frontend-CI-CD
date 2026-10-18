import * as Sentry from '@sentry/react'

const env = import.meta.env

export const SENTRY_ENABLED = Boolean(env.VITE_SENTRY_DSN)

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN, // public, like Datadog's client token
    environment: env.VITE_DD_ENV ?? 'local',
    // Same value as Datadog's `version`, so a release means the same thing in
    // both tools, and Sentry can say "first seen in 1.4.2" / "regressed in 1.4.3".
    release: env.VITE_APP_VERSION ?? 'dev',

    // Division of labour: Datadog owns performance (RUM, vitals, traces,
    // replay); Sentry owns error tracking. So no tracing or replay integrations
    // here: running two recorders/tracers doubles bundle size, CPU and cost.
    // Defaults still give breadcrumbs, global error handlers, dedupe and
    // session tracking (crash-free sessions / release health).

    // PII: v11 uses `dataCollection` (user info, cookies, headers, query
    // params…) with privacy-safe defaults; we keep the defaults.
    // `tunnel: '/sentry-tunnel'` is Sentry's equivalent of Datadog's `proxy`
    // (ad-blocker bypass); left out locally.
    sampleRate: 1.0, // errors: keep all; use quotas/spike protection for cost

    // Noise we never act on. Inbound filters in Sentry project settings do
    // the same server-side (browser extensions, legacy browsers, crawlers).
    ignoreErrors: [/ResizeObserver loop/],
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i],

    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/([?&](token|email)=)[^&]+/gi, '$1REDACTED')
      }
      return event
    },
  })

  Sentry.setUser({ id: 'u-1001' })
  Sentry.setTag('tenant', 'acme-corp')
}
