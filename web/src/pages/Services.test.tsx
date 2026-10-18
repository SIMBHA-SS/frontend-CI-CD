import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations, mockFetch } from '../test-utils'
import Services from './Services'

const TEAMS = ['payments', 'search', 'identity', 'checkout', 'catalog']
const services = Array.from({ length: 5000 }, (_, i) => ({
  id: i + 1,
  name: `service-${String(i + 1).padStart(4, '0')}`,
  team: TEAMS[i % 5],
  region: 'eu-west-1',
  p95Ms: i,
  errorRate: 0.1,
  status: 'healthy',
}))

describe('Services page', () => {
  it('loads all services and filters by team', async () => {
    mockFetch({ '/api/services': services })
    render(<Services />)

    expect(await screen.findByText('5000 services')).toBeTruthy()
    await userEvent.type(screen.getByLabelText(/filter services/i), 'payments')
    expect(await screen.findByText('1000 services')).toBeTruthy()
  })

  // Reliability guard for the Phase 5 fix: if someone removes virtualisation,
  // 5000 rows hit the DOM again and this fails in CI before users feel it.
  it('virtualises the table (renders far fewer rows than services)', async () => {
    // jsdom has no layout; give the scroll container a 600px viewport.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    mockFetch({ '/api/services': services })
    const { container } = render(<Services />)
    await screen.findByText('5000 services')

    // Real rows only (spacer rows are aria-hidden)
    const rows = container.querySelectorAll('tbody tr:not([aria-hidden])').length
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThan(100)
  })

  it('has no accessibility violations', async () => {
    mockFetch({ '/api/services': services.slice(0, 20) })
    const { container } = render(<Services />)
    await screen.findByText('20 services')
    expect(await axeViolations(container)).toEqual([])
  })
})
