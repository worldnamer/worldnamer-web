import * as Sentry from '@sentry/react'

// Reports uncaught errors to Sentry. Errors only: tracing, replay and logs stay off (Honeycomb covers tracing).
// Off unless VITE_SENTRY_DSN is set, so tests and local development send nothing.
// A DSN only lets someone send events to the project, and it ships to every visitor, so it is not a secret.
const dsn = import.meta.env.VITE_SENTRY_DSN

export function startSentry() {
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sentry 11 collects user info, cookies, headers, bodies and query params unless told otherwise
    // (sendDefaultPii no longer exists). Turn all of that off: the stack trace and the error are what we need.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  })
}

// React 19 catches errors thrown while rendering and reports them through these three hooks. Passing handlers
// replaces React's own console output, so they are only attached when Sentry is on; without a DSN React keeps its
// defaults and a local error still shows up in the console.
export const reactRootOptions = dsn
  ? {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    }
  : {}
