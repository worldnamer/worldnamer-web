import { clearSessionFlag, setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'

export const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`

export type SessionUser = { username: string }

// Thrown by the session functions when the API answers with a non-2xx status.
export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

type TokenResponse = { access_token: string; user: SessionUser }

async function requestNewToken(): Promise<SessionUser | null> {
  let response: Response
  try {
    // credentials: 'include' is required: a cross-origin fetch ignores Set-Cookie and does not send the cookie without it.
    response = await fetch(`${API_BASE}/session/refresh`, { method: 'POST', credentials: 'include' })
  } catch {
    // Network error: the API may just be down or starting up. Keep the flag so the next page load tries again.
    return null
  }
  if (response.status === 401) {
    clearAccessToken()
    clearSessionFlag()
    return null
  }
  if (!response.ok) return null // Any other failure (for example a 5xx) is treated like a network error.
  const body = (await response.json()) as TokenResponse
  setAccessToken(body.access_token)
  setSessionFlag()
  return { username: body.user.username }
}

let inFlight: Promise<SessionUser | null> | null = null

// Single flight: while a refresh is running, every caller gets the same promise, so any number of parallel 401s (and
// restoreSession) cause one request. The refresh token rotates, so a second concurrent refresh would be wasteful.
export function refreshSession(): Promise<SessionUser | null> {
  if (inFlight === null) {
    inFlight = requestNewToken().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

function send(path: string, init: RequestInit | undefined): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getAccessToken()
  if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

// fetch() for private endpoints. Adds the bearer token; on a 401 refreshes once and retries once, never more.
// Returns the Response whatever its status. Does not throw on non-2xx (a network error still rejects).
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await send(path, init)
  if (response.status !== 401) return response

  const user = await refreshSession()
  if (user === null) {
    clearAccessToken()
    clearSessionFlag()
    queryClient.setQueryData(['session'], null)
    return response
  }
  return send(path, init)
}
