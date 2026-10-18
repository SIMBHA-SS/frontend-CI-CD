import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'

const env = import.meta.env

export const RUM_ENABLED = Boolean(env.VITE_DD_APPLICATION_ID && env.VITE_DD_CLIENT_TOKEN)

if (RUM_ENABLED) {
  datadogRum.init({
    applicationId: env.VITE_DD_APPLICATION_ID,
    clientToken: env.VITE_DD_CLIENT_TOKEN, // public token, safe to ship in the bundle
    site: env.VITE_DD_SITE ?? 'datadoghq.com',
    // Send RUM to our own origin instead of browser-intake-datadoghq.com,
    // which ad blockers block (10-30% of sessions silently missing).
    proxy: env.VITE_DD_PROXY === 'true' ? `${window.location.origin}/dd-proxy` : undefined,
    service: 'depot-observability-ui',
    env: env.VITE_DD_ENV ?? 'local',
    // Must match --release-version used when uploading source maps,
    // and lets us compare vitals/errors per deploy (canary vs stable).
    version: env.VITE_APP_VERSION ?? 'dev',

    // Sampling = cost control. 100% for practice; prod is often 10-50%
    // sessions with a smaller % of those recorded for replay.
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,

    trackUserInteractions: true, // clicks -> RUM actions (needed for INP attribution)
    trackResources: true, // fetch/XHR/scripts/images timings
    trackLongTasks: true, // main-thread tasks > 50ms
    defaultPrivacyLevel: 'mask-user-input', // replay never records typed values

    // RUM <-> APM correlation: inject trace headers on calls to our API so the
    // backend span joins the same trace as the browser resource.
    allowedTracingUrls: [
      { match: (url: string) => url.startsWith(`${window.location.origin}/api`), propagatorTypes: ['datadog', 'tracecontext'] },
    ],
    traceSampleRate: 100,

    plugins: [reactPlugin({ router: true })],

    // Last chance to scrub or drop events before they leave the browser.
    beforeSend: (event) => {
      // Strip tokens/emails from URLs (PII + secrets hygiene).
      if (event.view?.url) {
        event.view.url = event.view.url.replace(/([?&](token|email)=)[^&]+/gi, '$1REDACTED')
      }
      // Drop noise we never act on.
      if (event.type === 'error' && /ResizeObserver loop/.test(event.error.message)) {
        return false
      }
      return true
    },
  })

  // Who is affected? Lets you filter sessions/errors by user and tenant.
  datadogRum.setUser({ id: 'u-1001', name: 'Practice User', plan: 'enterprise' })
  datadogRum.setGlobalContextProperty('tenant', 'acme-corp')
}

// Thin wrappers so components don't care whether RUM is configured.
export const rum = {
  action: (name: string, context?: object) => RUM_ENABLED && datadogRum.addAction(name, context),
  error: (error: unknown, context?: object) => RUM_ENABLED && datadogRum.addError(error, context),
  timing: (name: string) => RUM_ENABLED && datadogRum.addTiming(name),
}
