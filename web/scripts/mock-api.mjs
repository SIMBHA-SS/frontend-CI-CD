// The CDN serves static files only, so the deployed demo gets a static mock
// of the read endpoints (same JSON shapes as api/server.js). Chaos endpoints
// (/api/error, /api/flaky, /api/slow) are intentionally absent: on the CDN
// they return 403 from S3, a realistic "backend unavailable" signal.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = join('dist', 'api')
mkdirSync(out, { recursive: true })

const rand = (min, max) => Math.round(min + Math.random() * (max - min))
const services = Array.from({ length: 5000 }, (_, i) => ({
  id: i + 1,
  name: `service-${String(i + 1).padStart(4, '0')}`,
  team: ['payments', 'search', 'identity', 'checkout', 'catalog'][i % 5],
  region: ['eu-west-1', 'us-east-1', 'ap-south-1'][i % 3],
  p95Ms: rand(40, 1200),
  errorRate: +(Math.random() * 5).toFixed(2),
  status: Math.random() > 0.9 ? 'degraded' : 'healthy',
}))

// Extensionless names so URLs match the real API (/api/metrics).
writeFileSync(join(out, 'health'), JSON.stringify({ ok: true }))
writeFileSync(join(out, 'metrics'), JSON.stringify({ requestsPerMin: 12480, errorRate: 0.42, p95LatencyMs: 287, activeAlerts: 2 }))
writeFileSync(join(out, 'services'), JSON.stringify(services))
console.log('Mock API written to dist/api/')
