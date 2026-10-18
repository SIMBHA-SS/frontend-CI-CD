import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'

// Source map upload to Sentry runs only when an auth token is present
// (CI or a manual release build), never in everyday dev.
const sentryUpload = process.env.SENTRY_AUTH_TOKEN
  ? sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION },
      // Keep the .map files: the Datadog upload script runs next and
      // deletes them after its own upload.
      sourcemaps: { filesToDeleteAfterUpload: [] },
      telemetry: false,
    })
  : []

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sentryUpload],
  build: {
    // Generate source maps for Datadog/Sentry to unminify stack traces, but
    // don't reference them from the bundle (users can't download them).
    // They are uploaded in CI, then deleted before deploy.
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      // RUM intake proxy (ad-blocker bypass). In prod: CloudFront behavior.
      '/dd-proxy': 'http://localhost:3001',
    },
  },
})
