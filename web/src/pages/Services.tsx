import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { obs } from '../observability'
import { markStart, measureToNextPaint } from '../observability/perf'

type Service = {
  id: number
  name: string
  team: string
  region: string
  p95Ms: number
  errorRate: number
  status: 'healthy' | 'degraded'
}

const ROW_HEIGHT = 33

export default function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then(setServices)
  }, [])

  // FIX 1: the input renders with `query` immediately (urgent); the table
  // renders with `deferredQuery`, a low-priority update React can interrupt
  // if the user keeps typing. Typing stays responsive (better INP).
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  // FIX 2: sort once when data arrives, filter only when the deferred query
  // changes. Previously both ran on every render (including clock ticks).
  const sorted = useMemo(() => [...services].sort((a, b) => b.p95Ms - a.p95Ms), [services])
  const visible = useMemo(
    () => (deferredQuery ? sorted.filter((s) => s.name.includes(deferredQuery) || s.team.includes(deferredQuery)) : sorted),
    [sorted, deferredQuery],
  )

  // FIX 3: virtualisation, so only the ~25 rows in view (+ overscan) are in
  // the DOM instead of 5000. Less render work and far less layout/paint.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)

  // Custom action (debounced): product analytics + lets us find slow filters.
  useEffect(() => {
    if (!deferredQuery) return
    const id = setTimeout(() => obs.action('services_filter', { query: deferredQuery, results: visible.length }), 500)
    return () => clearTimeout(id)
  }, [deferredQuery, visible.length])

  // Custom vital: keystroke -> filtered table painted. Measured when the
  // *deferred* render commits, i.e. when the user actually sees results.
  useEffect(() => {
    measureToNextPaint('services_filter_latency', { query: deferredQuery, rows: visible.length })
  }, [deferredQuery, visible.length])

  return (
    <>
      <h1>Services</h1>
      <input
        id="services-filter"
        placeholder="Filter by name or team…"
        value={query}
        onChange={(e) => {
          markStart('services_filter_latency')
          setQuery(e.target.value)
        }}
        style={{ marginBottom: 12, width: 300, maxWidth: '100%' }}
      />
      <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{visible.length} services</span>
      <div ref={scrollRef} className="table-scroll" style={{ opacity: isStale ? 0.6 : 1 }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Team</th><th>Region</th><th>p95</th><th>Error %</th><th>Status</th></tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
            {items.map((item) => {
              const s = visible[item.index]
              return <Row key={s.id} service={s} />
            })}
            {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
          </tbody>
        </table>
      </div>
    </>
  )
}

// FIX 4: memo, so rows whose `service` object didn't change skip re-rendering
// while scrolling (the same objects are reused from `sorted`).
const Row = memo(function Row({ service: s }: { service: Service }) {
  return (
    <tr style={{ height: ROW_HEIGHT }}>
      <td>{s.name}</td>
      <td>{s.team}</td>
      <td>{s.region}</td>
      <td>{s.p95Ms} ms</td>
      <td>{s.errorRate}</td>
      <td className={`status-${s.status}`}>{s.status}</td>
    </tr>
  )
})
