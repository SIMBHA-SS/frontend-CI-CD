import axe from 'axe-core'
import { vi } from 'vitest'

/** Mock fetch with a fixed JSON response per URL path. */
export function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = routes[url]
      return { ok: body !== undefined, status: body !== undefined ? 200 : 500, json: async () => body }
    }),
  )
}

/** Run axe-core on a rendered container and return readable violations. */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    // jsdom can't compute colors or layout; Lighthouse CI covers contrast.
    // "region" assumes a full page; components are tested in isolation.
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}
