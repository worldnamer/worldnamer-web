import { HoneycombWebSDK } from '@honeycombio/opentelemetry-web'
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web'

// Sends browser traces to Honeycomb and links them to the API's traces through the traceparent header.
// Off unless VITE_HONEYCOMB_API_KEY is set, so tests and builds without a key send nothing.
// The key is an ingest key: it can only send data, and it ships to every visitor, so it is not a secret.
export function startTelemetry() {
  const apiKey = import.meta.env.VITE_HONEYCOMB_API_KEY
  if (!apiKey) return

  // The fetch instrumentation compares a string entry with ===, so the bare origin would never equal a full request
  // URL like https://api.example.com/api/v1/health. A RegExp anchored on the origin matches every path.
  const apiOrigin = new URL(import.meta.env.VITE_API_URL).origin
  const apiUrlPattern = new RegExp(`^${apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

  new HoneycombWebSDK({
    apiKey,
    serviceName: 'worldnamer-web',
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-document-load': {},
        '@opentelemetry/instrumentation-fetch': {
          // Without this the browser would not add traceparent to calls to another origin (the API).
          propagateTraceHeaderCorsUrls: [apiUrlPattern],
        },
        // Every click and every XHR would become its own span; not needed yet, and it burns event quota.
        '@opentelemetry/instrumentation-user-interaction': { enabled: false },
        '@opentelemetry/instrumentation-xml-http-request': { enabled: false },
      }),
    ],
  }).start()
}
