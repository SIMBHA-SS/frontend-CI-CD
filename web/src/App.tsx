import { NavLink, Route, useLocation } from 'react-router-dom'
// Drop-in replacement for <Routes>: every route render becomes a RUM view
// named by its route pattern (e.g. /services/:id, not /services/42).
import { Routes } from '@datadog/browser-rum-react/react-router-v7'
import { ErrorBoundary } from '@datadog/browser-rum-react'
import { ClockProvider, useClock } from './clock'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Chaos from './pages/Chaos'
import VitalsHud from './VitalsHud'

function Clock() {
  const now = useClock()
  return <div className="clock">{now.toLocaleTimeString()}</div>
}

function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="error-fallback" role="alert">
      <h3>This page crashed</h3>
      <p>{error.message}</p>
      <button onClick={resetError}>Retry</button>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  return (
    // PERF BUG (Phase 5): the clock context ticks every second and wraps the
    // whole app, so every consumer re-renders each second.
    <ClockProvider>
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
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/services" element={<Services />} />
              <Route path="/chaos" element={<Chaos />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
      {import.meta.env.DEV && <VitalsHud />}
    </ClockProvider>
  )
}
