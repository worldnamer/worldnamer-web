// Types for the VITE_ variables defined in .env.development and .env.production.
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // Honeycomb ingest key. Optional: set in .env.development.local (gitignored) and, in production, in Vercel.
  readonly VITE_HONEYCOMB_API_KEY?: string
  // Sentry DSN for the worldnamer-web project. Optional: only set in production (Vercel) or temporarily when testing.
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
