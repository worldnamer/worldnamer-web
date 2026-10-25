import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reactRootOptions, startSentry } from './sentry.ts'
import { startTelemetry } from './telemetry.ts'
import { inject } from '@vercel/analytics'

startSentry()
startTelemetry()

// Vercel Web Analytics (page views and visitors; no cookies). Only in a production build, so local development and
// tests send nothing and load nothing. It is enabled per project in the Vercel dashboard.
if (import.meta.env.PROD) {
  inject()
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!, reactRootOptions).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
