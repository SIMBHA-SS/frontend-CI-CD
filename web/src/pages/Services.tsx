import { useEffect, useState } from 'react'
import { rum } from '../observability/datadog'

type Service = {
  id: number
  name: string
  team: string
  region: string
  p95Ms: number
  errorRate: number
  status: 'healthy' | 'degraded'
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then(setServices)
  }, [])

  // PERF BUGS (Phase 5):
  //  1. Filtering + sorting 5000 rows on every keystroke, not memoised.
  //  2. All 5000 rows rendered to the DOM (no virtualisation) -> poor INP.
  //  3. Input update is urgent; no useDeferredValue/useTransition.
  const visible = services
    .filter((s) => s.name.includes(query) || s.team.includes(query))
    .sort((a, b) => b.p95Ms - a.p95Ms)

  // Custom action (debounced): product analytics + lets us find slow filters.
  useEffect(() => {
    if (!query) return
    const id = setTimeout(() => rum.action('services_filter', { query, results: visible.length }), 500)
    return () => clearTimeout(id)
  }, [query, visible.length])

  return (
    <>
      <h1>Services</h1>
      <input
        placeholder="Filter by name or team…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12, width: 300 }}
      />
      <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{visible.length} services</span>
      <table>
        <thead>
          <tr><th>Name</th><th>Team</th><th>Region</th><th>p95</th><th>Error %</th><th>Status</th></tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <Row key={s.id} service={s} />
          ))}
        </tbody>
      </table>
    </>
  )
}

function Row({ service: s }: { service: Service }) {
  return (
    <tr>
      <td>{s.name}</td>
      <td>{s.team}</td>
      <td>{s.region}</td>
      <td>{s.p95Ms} ms</td>
      <td>{s.errorRate}</td>
      <td className={`status-${s.status}`}>{s.status}</td>
    </tr>
  )
}
