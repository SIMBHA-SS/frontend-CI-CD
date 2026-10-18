import { Suspense, useEffect, useState } from 'react'
import { NavLink, Route, useLocation } from 'react-router-dom'
// Drop-in replacement for <Routes>: every route render becomes a RUM view
// named by its route pattern (e.g. /services/:id, not /services/42).
import { Routes } from '@datadog/browser-rum-react/react-router-v7'
import { ErrorBoundary } from '@datadog/browser-rum-react'
import Dashboard from './pages/Dashboard'
import VitalsHud from './VitalsHud'
import { lazyWithRetry } from './lazyWithRetry'

// Landing page stays in the main bundle (it's the LCP route); the others load
// on demand. Gain is small here (app code is ~3% of the bundle) but it's the
// pattern that scales as pages grow.
const Services = lazyWithRetry(() => import('./pages/Services'))
const Chaos = lazyWithRetry(() => import('./pages/Chaos'))

// FIX (Phase 5): the clock used to live in a context wrapping the whole app,
// re-rendering every consumer each second. State now lives in the only
// component that displays it ("colocate state"), so a tick re-renders
// just this <div>.
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <div className="clock">{now.toLocaleTimeString()}</div>
}

function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="error-fallback" role="alert">
      <h2>This page crashed</h2>
      <p>{error.message}</p>
      <button onClick={resetError}>Retry</button>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  return (
    <>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">DEPOT Observability</div>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/services">Services</NavLink>
            <NavLink to="/chaos">Chaos Lab</NavLink>
          </nav>
          <Clock />
        </aside>
        <main>
          {/* Boundary around page content only: a crashing page keeps the
              nav usable. Keyed by path so navigating away resets it. */}
          <ErrorBoundary key={location.pathname} fallback={ErrorFallback}>
            <Suspense fallback={<p className="page-loading">Loading…</p>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/services" element={<Services />} />
                <Route path="/chaos" element={<Chaos />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {import.meta.env.DEV && <VitalsHud />}
    </>
  )
}
