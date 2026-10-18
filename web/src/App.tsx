import { NavLink, Route, Routes } from 'react-router-dom'
import { ClockProvider, useClock } from './clock'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Chaos from './pages/Chaos'

function Clock() {
  const now = useClock()
  return <div className="clock">{now.toLocaleTimeString()}</div>
}

export default function App() {
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/services" element={<Services />} />
            <Route path="/chaos" element={<Chaos />} />
          </Routes>
        </main>
      </div>
    </ClockProvider>
  )
}
