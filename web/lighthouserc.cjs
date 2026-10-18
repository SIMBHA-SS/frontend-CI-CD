// Lighthouse CI: lab performance + accessibility gate on every PR.
// Runs against the production build (vite preview), never the dev server.
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --port 4173 --strictPort',
      startServerReadyPattern: 'localhost:4173',
      url: ['http://localhost:4173/', 'http://localhost:4173/services', 'http://localhost:4173/chaos'],
      // Lighthouse scores vary run to run; 3 runs and the median cuts flakiness.
      numberOfRuns: 3,
      settings: {
        // Desktop profile: the observability UI is a desktop tool for engineers.
        // A consumer site would gate on the default mobile profile instead.
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        // Category scores (0-1)
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],

        // Performance budgets, lab metrics (ms / unitless)
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }], // lab proxy for INP
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],

        // A11y audits we never want to regress, even if the score stays high
        'color-contrast': 'error',
        'label': 'error',
        'heading-order': 'error',
        'button-name': 'error',
      },
    },
    upload: {
      // Free public report URL per run (link appears in the CI log).
      // A team would run its own LHCI server to keep history and diffs.
      target: 'temporary-public-storage',
    },
  },
}
