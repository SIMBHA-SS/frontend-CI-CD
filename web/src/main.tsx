// Must be first: Datadog + Sentry should start before anything can fail.
import './observability'
import './observability/webVitals'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { addReactError } from '@datadog/browser-rum-react'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

const sentryReactError = Sentry.reactErrorHandler()

createRoot(document.getElementById('root')!, {
  // Errors that escape every boundary (white screen): report to both tools.
  onUncaughtError: (error, errorInfo) => {
    addReactError(error, errorInfo)
    sentryReactError(error, errorInfo)
  },
  // Errors caught by our boundary. The Datadog <ErrorBoundary> already
  // reports them to Datadog, so this sends them to Sentry only. One
  // report per tool, no duplicates.
  onCaughtError: (error, errorInfo) => {
    sentryReactError(error, errorInfo)
    console.error('Caught by boundary:', error)
  },
  onRecoverableError: (error, errorInfo) => sentryReactError(error, errorInfo),
}).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
