import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Generate source maps for Datadog/Sentry to unminify stack traces, but
    // don't reference them from the bundle (users can't download them).
    // They are uploaded in CI, then deleted before deploy.
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
