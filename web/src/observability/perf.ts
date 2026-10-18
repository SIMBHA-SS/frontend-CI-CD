// Custom performance instrumentation with the User Timing API.
// Marks/measures show up in DevTools > Performance > "Timings" track, and
// are sent to Datadog as custom duration vitals.
import { obs } from '.'

/** Call in the event handler that starts the interaction. */
export function markStart(name: string) {
  performance.mark(`${name}:start`)
}

/**
 * Call after React commits the result (e.g. in useEffect). Waits for the next
 * frame to actually paint, so the duration is "input -> pixels on screen",
 * the same thing INP measures, but for one specific interaction we care about.
 */
export function measureToNextPaint(name: string, context?: Record<string, unknown>) {
  if (!performance.getEntriesByName(`${name}:start`, 'mark').length) return
  requestAnimationFrame(() =>
    setTimeout(() => {
      const m = performance.measure(name, `${name}:start`)
      performance.clearMarks(`${name}:start`)
      obs.vital(name, m.startTime, m.duration, context)
    }, 0),
  )
}
