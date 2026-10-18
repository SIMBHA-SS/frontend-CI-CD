// Practice API for the FRE app. Endpoints deliberately include slow and
// failing behaviour so the frontend has real latency/errors to observe.
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const SERVICES = Array.from({ length: 5000 }, (_, i) => ({
  id: i + 1,
  name: `service-${String(i + 1).padStart(4, '0')}`,
  team: ['payments', 'search', 'identity', 'checkout', 'catalog'][i % 5],
  region: ['eu-west-1', 'us-east-1', 'ap-south-1'][i % 3],
  p95Ms: rand(40, 1200),
  errorRate: +(Math.random() * 5).toFixed(2),
  status: Math.random() > 0.9 ? 'degraded' : 'healthy',
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Normal endpoint: 50-250 ms
app.get('/api/metrics', async (_req, res) => {
  await sleep(rand(50, 250));
  res.json({
    requestsPerMin: rand(9000, 15000),
    errorRate: +(Math.random() * 2).toFixed(2),
    p95LatencyMs: rand(180, 450),
    activeAlerts: rand(0, 6),
  });
});

// Large payload: used for the big table (perf profiling practice)
app.get('/api/services', async (_req, res) => {
  await sleep(rand(100, 300));
  res.json(SERVICES);
});

// Slow endpoint: /api/slow?ms=3000
app.get('/api/slow', async (req, res) => {
  const ms = Number(req.query.ms) || 3000;
  await sleep(ms);
  res.json({ waitedMs: ms });
});

// Flaky endpoint: fails ~30% of the time
app.get('/api/flaky', async (_req, res) => {
  await sleep(rand(50, 200));
  if (Math.random() < 0.3) {
    return res.status(503).json({ error: 'Upstream unavailable' });
  }
  res.json({ ok: true });
});

// Always fails
app.get('/api/error', (_req, res) => {
  res.status(500).json({ error: 'Internal server error (simulated)' });
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
