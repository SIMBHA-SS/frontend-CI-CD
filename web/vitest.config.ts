import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the Sentry/visualizer plugins.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Vite loads .env.local in tests too: blank the keys so tests never
    // send real telemetry to Datadog/Sentry.
    env: { VITE_DD_APPLICATION_ID: '', VITE_DD_CLIENT_TOKEN: '', VITE_SENTRY_DSN: '' },
  },
})
