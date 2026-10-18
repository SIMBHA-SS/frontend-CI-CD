import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axeViolations, mockFetch } from '../test-utils'
import Chaos from './Chaos'
import Dashboard from './Dashboard'

// Automated WCAG checks (axe-core). Catches roughly 30-50% of issues
// (missing labels, names, roles, ARIA misuse); manual keyboard and
// screen-reader testing covers the rest.
describe('accessibility', () => {
  it('Dashboard has no axe violations', async () => {
    mockFetch({ '/api/metrics': { requestsPerMin: 12000, errorRate: 0.5, p95LatencyMs: 300, activeAlerts: 2 } })
    const { container } = render(<Dashboard />)
    await screen.findByText('12,000')
    expect(await axeViolations(container)).toEqual([])
  })

  it('Chaos Lab has no axe violations', async () => {
    const { container } = render(<Chaos />)
    expect(await axeViolations(container)).toEqual([])
  })
})
