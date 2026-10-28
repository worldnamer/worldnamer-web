import { http, HttpResponse } from 'msw'

// Shared MSW handlers for the login contract (specs/login-plan.md, section 3).
// They are NOT registered in server.ts by default: an empty server is what proves "no flag, no request" (an
// unhandled request fails the test). A test opts in with server.use(...sessionHandlers) or picks single handlers.

export const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`

export const VALID_USERNAME = 'john'
export const VALID_PASSWORD = 'correct horse battery'
export const LOGIN_TOKEN = 'token-from-login'
export const REFRESH_TOKEN = 'token-from-refresh'

// The body shared by login and refresh (200).
export function tokenBody(accessToken: string, username = VALID_USERNAME) {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: 900, user: { username } }
}

// The error shape: { error: { code, message } }.
export function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const noStore = { 'Cache-Control': 'no-store' }

export const loginHandler = http.post(`${API_BASE}/session`, async ({ request }) => {
  const body = (await request.json()) as { username?: string; password?: string }
  if (body.username === VALID_USERNAME && body.password === VALID_PASSWORD) {
    return HttpResponse.json(tokenBody(LOGIN_TOKEN), { headers: noStore })
  }
  return HttpResponse.json(errorBody('invalid_credentials', 'Invalid username or password.'), { status: 401 })
})

export const refreshHandler = http.post(`${API_BASE}/session/refresh`, () =>
  HttpResponse.json(tokenBody(REFRESH_TOKEN), { headers: noStore }),
)

export const logoutHandler = http.delete(`${API_BASE}/session`, () => new HttpResponse(null, { status: 204 }))

// 200 only for the token that refreshHandler hands out or loginHandler hands out; anything else is 401.
export const meHandler = http.get(`${API_BASE}/me`, ({ request }) => {
  const auth = request.headers.get('Authorization')
  if (auth === `Bearer ${REFRESH_TOKEN}` || auth === `Bearer ${LOGIN_TOKEN}`) {
    return HttpResponse.json({ user: { username: VALID_USERNAME } })
  }
  return HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 })
})

export const sessionHandlers = [loginHandler, refreshHandler, logoutHandler, meHandler]
