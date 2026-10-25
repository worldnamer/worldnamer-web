import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reactRootOptions, startSentry } from './sentry.ts'
import { startTelemetry } from './telemetry.ts'

startSentry()
startTelemetry()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!, reactRootOptions).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
