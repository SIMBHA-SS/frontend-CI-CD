import { useEffect, useState } from 'react'
import { obs } from '../observability'

// Chaos Lab: each button triggers a real failure mode that we will later
// detect with Datadog RUM / Sentry and debug with DevTools.

const leaked: number[][] = []

function Bomb(): never {
  throw new Error('Simulated render crash in <Bomb />')
}

export default function Chaos() {
  const [log, setLog] = useState<string[]>([])
  const [crash, setCrash] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const add = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 20))

  // A banner arrives 1.5 s after mount (like a late API response or ad).
  // FIX (Phase 5): its slot is reserved below, so nothing shifts (CLS 0).
  useEffect(() => {
    const id = setTimeout(() => setShowBanner(true), 1500)
    return () => clearTimeout(id)
  }, [])

  const actions = [
    {
      title: 'Render crash',
      desc: 'Throws during render. With no error boundary, the whole app unmounts (white screen).',
      run: () => setCrash(true),
    },
    {
      title: 'Unhandled promise rejection',
      desc: 'Async error outside React; error boundaries cannot catch this.',
      run: () => {
        Promise.reject(new Error('Simulated unhandled rejection'))
        add('Fired unhandled rejection')
      },
    },
    {
      title: 'Failing API (500)',
      desc: 'GET /api/error. Shows up as a failed resource in RUM.',
      run: async () => {
        const status = (await fetch('/api/error')).status
        add(`/api/error -> ${status}`)
        obs.error(new Error(`HTTP ${status} on /api/error`), { feature: 'chaos', endpoint: '/api/error', status })
      },
    },
    {
      title: 'Flaky API (30% 503)',
      desc: 'GET /api/flaky ×10. Good for an API success-rate SLI.',
      run: async () => {
        const codes = await Promise.all(Array.from({ length: 10 }, () => fetch('/api/flaky').then((r) => r.status)))
        add(`/api/flaky -> ${codes.join(', ')}`)
        // Several failures, different messages, but the fingerprint groups
        // them into ONE Sentry issue for /api/flaky.
        codes
          .filter((c) => c >= 500)
          .forEach((c) => obs.error(new Error(`HTTP ${c} on /api/flaky`), { feature: 'chaos', endpoint: '/api/flaky', status: c }))
      },
    },
    {
      title: 'Slow API (4 s)',
      desc: 'GET /api/slow?ms=4000. Latency SLI breach.',
      run: async () => {
        const t = performance.now()
        await fetch('/api/slow?ms=4000')
        add(`/api/slow took ${Math.round(performance.now() - t)} ms`)
      },
    },
    {
      title: 'Long task (bad INP)',
      desc: 'Blocks the main thread for 800 ms on click.',
      run: () => {
        const end = performance.now() + 800
        while (performance.now() < end) { /* busy */ }
        add('Blocked main thread for 800 ms')
      },
    },
    {
      title: 'Memory leak',
      desc: 'Adds ~8 MB to a module-level array and a window listener that is never removed.',
      run: () => {
        leaked.push(new Array(1_000_000).fill(Math.random()))
        window.addEventListener('resize', () => leaked.length)
        add(`Leaked chunks: ${leaked.length} (~${leaked.length * 8} MB)`)
      },
    },
  ]

  return (
    <>
      <div className="banner-slot">
        {showBanner && <div className="banner">⚠ Maintenance window tonight 22:00 UTC (late-loading banner, space reserved → no CLS)</div>}
      </div>
      <h1>Chaos Lab</h1>
      {crash && <Bomb />}
      <div className="chaos-grid">
        {actions.map((a) => (
          <div className="card" key={a.title}>
            <h3>{a.title}</h3>
            <p>{a.desc}</p>
            <button
              onClick={() => {
                obs.action('chaos_trigger', { scenario: a.title })
                a.run()
              }}
            >
              Trigger
            </button>
          </div>
        ))}
      </div>
      <div className="log">{log.length ? log.join('\n') : 'Event log…'}</div>
    </>
  )
}
