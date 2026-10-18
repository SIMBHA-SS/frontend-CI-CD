// Must be first: RUM should start before anything else can fail or load.
import './observability/datadog'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { addReactError } from '@datadog/browser-rum-react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!, {
  // Errors that escape every boundary (white screen). Caught errors are
  // reported by the Datadog <ErrorBoundary>, so no onCaughtError here
  // (that would double-report).
  onUncaughtError: (error, errorInfo) => {
    addReactError(error, errorInfo)
    console.error('Uncaught error:', error)
  },
}).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
