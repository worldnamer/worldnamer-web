// INTERFACE (web-1), file: src/lib/queryClient.ts
//   export const queryClient: QueryClient   // the one shared client; main.tsx should use it too
//   The session cache is the query ['session'], holding { username: string } | null.
//
// INTERFACE (web-1), file: src/api/client.ts
//   export const API_BASE: string           // `${import.meta.env.VITE_API_URL}/api/v1`
//   export class ApiError extends Error { status: number }   // thrown by session functions on a non-2xx answer
//   export type SessionUser = { username: string }
//   export function apiFetch(path: string, init?: RequestInit): Promise<Response>
//     path is relative to API_BASE, e.g. '/me'. Returns the Response (does not throw on non-2xx).
//     - Adds 'Authorization: Bearer <token>' when getAccessToken() is not null.
//     - On a 401 response: awaits refreshSession(), then retries the same request ONCE with the new token.
//       If the refresh gave null: clearAccessToken(), clearSessionFlag(), queryClient.setQueryData(['session'], null),
//       and return the original 401 Response. The retry's response is returned as is (no second refresh, no loop).
//   export function refreshSession(): Promise<SessionUser | null>
//     Single-flight: while one refresh is in flight, every caller gets the SAME promise. Once it settles, the next call
//     starts a new request. POST `${API_BASE}/session/refresh` with credentials: 'include'.
//     - 200: setAccessToken(body.access_token), setSessionFlag(), resolves { username: body.user.username }.
//     - 401: clearAccessToken(), clearSessionFlag(), resolves null.
//     - network error: resolves null, leaves the flag alone (so the next page load tries again).
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HAS_SESSION_KEY, hasSessionFlag, setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, REFRESH_TOKEN, refreshHandler, tokenBody } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { apiFetch, refreshSession } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  clearAccessToken()
  localStorage.clear()
  sessionStorage.clear()
  queryClient.clear()
})

const unauthenticated = () => HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 })

describe('apiFetch', () => {
  it('exports a shared QueryClient', () => {
    expect(queryClient).toBeInstanceOf(QueryClient)
  })

  it('sends no Authorization header when there is no token', async () => {
    let seen: string | null = 'untouched'
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({ user: { username: 'john' } })
      }),
    )
    const response = await apiFetch('/me')
    expect(response.status).toBe(200)
    expect(seen).toBeNull()
  })

  it('sends the bearer token when there is one', async () => {
    let seen: string | null = null
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({ user: { username: 'john' } })
      }),
    )
    setAccessToken('abc')
    await apiFetch('/me')
    expect(seen).toBe('Bearer abc')
  })

  it('on a 401 refreshes once, retries once with the new token, and returns the retry', async () => {
    const seenAuth: (string | null)[] = []
    let refreshes = 0
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) => {
        const auth = request.headers.get('Authorization')
        seenAuth.push(auth)
        if (auth === `Bearer ${REFRESH_TOKEN}`) return HttpResponse.json({ user: { username: 'john' } })
        return unauthenticated()
      }),
      http.post(`${API_BASE}/session/refresh`, () => {
        refreshes += 1
        return HttpResponse.json(tokenBody(REFRESH_TOKEN))
      }),
    )
    setAccessToken('expired')
    const response = await apiFetch('/me')
    expect(response.status).toBe(200)
    expect(refreshes).toBe(1)
    expect(seenAuth).toEqual(['Bearer expired', `Bearer ${REFRESH_TOKEN}`])
    expect(getAccessToken()).toBe(REFRESH_TOKEN)
  })

  it('three parallel 401s cause exactly one refresh and each request is retried once', async () => {
    let refreshes = 0
    let meCalls = 0
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) => {
        meCalls += 1
        return request.headers.get('Authorization') === `Bearer ${REFRESH_TOKEN}`
          ? HttpResponse.json({ user: { username: 'john' } })
          : unauthenticated()
      }),
      http.post(`${API_BASE}/session/refresh`, async () => {
        refreshes += 1
        // Keep the refresh in flight long enough for all three callers to be waiting on it.
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json(tokenBody(REFRESH_TOKEN))
      }),
    )
    setAccessToken('expired')
    const responses = await Promise.all([apiFetch('/me'), apiFetch('/me'), apiFetch('/me')])
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200])
    expect(refreshes).toBe(1)
    expect(meCalls).toBe(6) // 3 first tries + 3 retries, no more
  })

  it('when the refresh fails it logs out and does not loop', async () => {
    let refreshes = 0
    let meCalls = 0
    server.use(
      http.get(`${API_BASE}/me`, () => {
        meCalls += 1
        return unauthenticated()
      }),
      http.post(`${API_BASE}/session/refresh`, () => {
        refreshes += 1
        return unauthenticated()
      }),
    )
    setAccessToken('expired')
    setSessionFlag()
    queryClient.setQueryData(['session'], { username: 'john' })

    const response = await apiFetch('/me')

    expect(response.status).toBe(401)
    expect(refreshes).toBe(1)
    expect(meCalls).toBe(1) // not retried, because there is no new token
    expect(getAccessToken()).toBeNull()
    expect(hasSessionFlag()).toBe(false)
    expect(queryClient.getQueryData(['session'])).toBeNull()
  })

  it('retries only once: a 401 on the retry is returned, with no second refresh', async () => {
    let refreshes = 0
    let meCalls = 0
    server.use(
      http.get(`${API_BASE}/me`, () => {
        meCalls += 1
        return unauthenticated()
      }),
      http.post(`${API_BASE}/session/refresh`, () => {
        refreshes += 1
        return HttpResponse.json(tokenBody(REFRESH_TOKEN))
      }),
    )
    setAccessToken('expired')
    const response = await apiFetch('/me')
    expect(response.status).toBe(401)
    expect(refreshes).toBe(1)
    expect(meCalls).toBe(2)
  })
})

describe('refreshSession', () => {
  it('on 200 stores the token, sets the flag and returns the user', async () => {
    server.use(refreshHandler)
    await expect(refreshSession()).resolves.toEqual({ username: 'john' })
    expect(getAccessToken()).toBe(REFRESH_TOKEN)
    expect(localStorage.getItem(HAS_SESSION_KEY)).toBe('1')
  })

  it('sends the request with credentials: include', async () => {
    // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(http.post(`${API_BASE}/session/refresh`, () => HttpResponse.json(tokenBody(REFRESH_TOKEN))))
    await refreshSession()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/session/refresh'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('shares one request between concurrent callers, and starts a new one after it settles', async () => {
    let refreshes = 0
    server.use(
      http.post(`${API_BASE}/session/refresh`, async () => {
        refreshes += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return HttpResponse.json(tokenBody(REFRESH_TOKEN))
      }),
    )
    await Promise.all([refreshSession(), refreshSession()])
    expect(refreshes).toBe(1)
    await refreshSession()
    expect(refreshes).toBe(2)
  })

  it('on 401 clears the token and the flag and returns null', async () => {
    server.use(http.post(`${API_BASE}/session/refresh`, unauthenticated))
    setAccessToken('old')
    setSessionFlag()
    await expect(refreshSession()).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(hasSessionFlag()).toBe(false)
  })

  it('on a network error returns null and keeps the flag', async () => {
    server.use(http.post(`${API_BASE}/session/refresh`, () => HttpResponse.error()))
    setSessionFlag()
    await expect(refreshSession()).resolves.toBeNull()
    expect(hasSessionFlag()).toBe(true)
  })
})
