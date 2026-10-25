import { setupServer } from 'msw/node'

// A fake network for tests. Each test registers the API responses it needs with server.use(...).
export const server = setupServer()
