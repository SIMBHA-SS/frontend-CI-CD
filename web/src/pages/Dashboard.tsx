import { useEffect, useState, type ReactNode } from 'react'
import { obs } from '../observability'

type Metrics = {
  requestsPerMin: number
  errorRate: number
  p95LatencyMs: number
  activeAlerts: number
}

export default function Dashboard() {
  // FIX (Phase 5): "viewed at" never changes after mount, so compute it once
  // instead of subscribing to a clock that re-rendered this page every second.
  const [now] = useState(() => new Date())
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let first = true
    const load = () =>
      fetch('/api/metrics')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((m) => {
          setMetrics(m)
          // Custom timing: "time until the user actually sees numbers",
          // a more honest metric for a data UI than LCP of a skeleton.
          if (first) obs.timing('dashboard_metrics_visible')
          first = false
        })
        .catch((e) => {
          setError(String(e))
          // Handled errors are invisible to RUM unless reported explicitly.
          obs.error(e, { feature: 'dashboard', endpoint: '/api/metrics' })
        })
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <h1>Platform Overview</h1>
      {error && <p className="status-degraded">Failed to load: {error}</p>}
      <div className="cards">
        <Card label="Requests / min" value={metrics?.requestsPerMin.toLocaleString()} />
        <Card label="Error rate" value={metrics && `${metrics.errorRate}%`} />
        <Card label="p95 latency" value={metrics && `${metrics.p95LatencyMs} ms`} />
        <Card label="Active alerts" value={metrics?.activeAlerts} />
      </div>
      <p style={{ marginTop: 12, color: 'var(--muted)' }}>Viewed at {now.toLocaleTimeString()}</p>
    </>
  )
}

function Card({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
    </div>
  )
}
