// Core Web Vitals measured with Google's `web-vitals` library (attribution
// build). Datadog RUM already collects LCP/INP/CLS; this adds the *why*
// (which element, which sub-part, which script), keeps us vendor-neutral, and
// powers the on-screen HUD for local debugging.
import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricWithAttribution } from 'web-vitals/attribution'
import { obs } from '.'

export type VitalSnapshot = {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  detail: Record<string, unknown>
}

// Tiny external store for the HUD (useSyncExternalStore-friendly).
let snapshot: Record<string, VitalSnapshot> = {}
const listeners = new Set<() => void>()
export const vitalsStore = {
  get: () => snapshot,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

const ms = (n: number | undefined) => (n === undefined ? undefined : Math.round(n))

/** Reduce attribution to the fields that explain a bad score. */
function explain(m: MetricWithAttribution): Record<string, unknown> {
  switch (m.name) {
    case 'LCP': {
      const a = m.attribution
      // LCP = TTFB + resource load delay + resource load duration + render delay
      return {
        element: a.target,
        resource: a.url,
        ttfb: ms(a.timeToFirstByte),
        loadDelay: ms(a.resourceLoadDelay),
        loadDuration: ms(a.resourceLoadDuration),
        renderDelay: ms(a.elementRenderDelay),
      }
    }
    case 'INP': {
      const a = m.attribution
      // INP = input delay + processing (your handlers + React render) + presentation (layout/paint)
      return {
        element: a.interactionTarget,
        type: a.interactionType,
        inputDelay: ms(a.inputDelay),
        processing: ms(a.processingDuration),
        presentation: ms(a.presentationDelay),
        longestScript: a.longestScript
          ? `${a.longestScript.entry.invoker} · ${ms(a.longestScript.intersectingDuration)}ms in ${a.longestScript.subpart}`
          : undefined,
        loadState: a.loadState,
      }
    }
    case 'CLS': {
      const a = m.attribution
      return { element: a.largestShiftTarget, largestShift: a.largestShiftValue?.toFixed(3), loadState: a.loadState }
    }
    case 'FCP':
      return { ttfb: ms(m.attribution.timeToFirstByte), loadState: m.attribution.loadState }
    case 'TTFB':
      return {
        dns: ms(m.attribution.dnsDuration),
        connect: ms(m.attribution.connectionDuration),
        waiting: ms(m.attribution.waitingDuration),
        request: ms(m.attribution.requestDuration),
      }
  }
}

const toSnapshot = (m: MetricWithAttribution): VitalSnapshot => ({
  name: m.name,
  value: m.name === 'CLS' ? +m.value.toFixed(3) : Math.round(m.value),
  rating: m.rating,
  detail: explain(m),
})

// 1. Final values (once per page view, when the page is hidden) -> telemetry.
const report = (m: MetricWithAttribution) => {
  const v = toSnapshot(m)
  obs.action('web_vital', { name: v.name, value: v.value, rating: v.rating, navigationType: m.navigationType, ...v.detail })
}

// 2. Every change -> HUD + console, so you see INP/CLS move as you interact.
const live = (m: MetricWithAttribution) => {
  const v = toSnapshot(m)
  snapshot = { ...snapshot, [v.name]: v }
  listeners.forEach((fn) => fn())
  if (import.meta.env.DEV && v.rating !== 'good') {
    console.groupCollapsed(`%c[web-vitals] ${v.name} ${v.value} (${v.rating})`, 'color:#b45309')
    console.table(v.detail)
    console.groupEnd()
  }
}

for (const on of [onLCP, onINP, onCLS, onFCP, onTTFB] as const) {
  on(report as never)
  on(live as never, { reportAllChanges: true })
}
