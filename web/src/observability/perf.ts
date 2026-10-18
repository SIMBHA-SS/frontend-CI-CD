// Custom performance instrumentation with the User Timing API.
// Marks/measures show up in DevTools > Performance > "Timings" track, and
// are sent to Datadog as custom duration vitals.
import { obs } from '.'

/** Call in the event handler that starts the interaction. */
const supported = typeof performance !== 'undefined' && typeof performance.mark === 'function' && typeof performance.measure === 'function'

export function markStart(name: string) {
  if (!supported) return // old browsers, some test environments
  performance.mark(`${name}:start`)
}

/**
 * Call after React commits the result (e.g. in useEffect). Waits for the next
 * frame to actually paint, so the duration is "input -> pixels on screen",
 * the same thing INP measures, but for one specific interaction we care about.
 */
export function measureToNextPaint(name: string, context?: Record<string, unknown>) {
  if (!supported) return
  const marks = performance.getEntriesByName(`${name}:start`, 'mark')
  if (!marks.length) return
  // Claim the mark *now*. Reading it later (after the frame) raced with the
  // next keystroke's measurement, which had already cleared it, and threw.
  // Unit tests caught this.
  const start = marks[marks.length - 1].startTime
  performance.clearMarks(`${name}:start`)
  requestAnimationFrame(() =>
    setTimeout(() => {
      const m = performance.measure(name, { start })
      obs.vital(name, m.startTime, m.duration, context)
    }, 0),
  )
}
