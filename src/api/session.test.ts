// INTERFACE (web-1), file: src/api/session.ts   (also uses client.ts, tokenStore.ts, sessionFlag.ts, queryClient.ts)
//   export function login(username: string, password: string): Promise<SessionUser>
//     POST `${API_BASE}/session`, header Content-Type: application/json, body JSON.stringify({ username, password }),
//     credentials: 'include'. No credentials in the URL. 200: setAccessToken, setSessionFlag,
//     queryClient.setQueryData(['session'], user), resolves { username }.
//     Any non-2xx answer rejects with ApiError (status = HTTP status; nothing stored). A network error rejects with
//     whatever fetch threw (not an ApiError); the UI maps that to loginErrorMessage(null).
//   export function restoreSession(): Promise<SessionUser | null>
//     No flag: resolves null at once, makes NO request. Flag: returns refreshSession() (shared single flight).
//   export function logout(): Promise<void>
//     DELETE `${API_BASE}/session` with credentials: 'include'. Whatever happens (204, 500, network error), then:
//     clearAccessToken(), clearSessionFlag(), queryClient.clear() (drops private data), then
//     queryClient.setQueryData(['session'], null). Resolves (never rejects).
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HAS_SESSION_KEY, hasSessionFlag, setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import {
  API_BASE,
  errorBody,
  LOGIN_TOKEN,
  logoutHandler,
  REFRESH_TOKEN,
  sessionHandlers,
  tokenBody,
  VALID_PASSWORD,
  VALID_USERNAME,
} from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { login, logout, restoreSession } from './session'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  clearAccessToken()
  localStorage.clear()
  sessionStorage.clear()
  queryClient.clear()
})

describe('restoreSession', () => {
  it('with no flag returns null and makes no request', async () => {
    // The server has no handlers: any request at all would fail the test (onUnhandledFrame: 'error').
    await expect(restoreSession()).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('with the flag and a refresh 200 returns the user and stores the token', async () => {
    server.use(...sessionHandlers)
    setSessionFlag()
    await expect(restoreSession()).resolves.toEqual({ username: 'john' })
    expect(getAccessToken()).toBe(REFRESH_TOKEN)
    expect(hasSessionFlag()).toBe(true)
  })

  it('with the flag and a refresh 401 returns null and clears the flag', async () => {
    server.use(
      http.post(`${API_BASE}/session/refresh`, () =>
        HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 }),
      ),
    )
    setSessionFlag()
    await expect(restoreSession()).resolves.toBeNull()
    expect(hasSessionFlag()).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('with the flag and a network error returns null', async () => {
    server.use(http.post(`${API_BASE}/session/refresh`, () => HttpResponse.error()))
    setSessionFlag()
    await expect(restoreSession()).resolves.toBeNull()
  })
})

describe('login', () => {
  it('sends a POST with a JSON body, credentials: include, and no password in the URL', async () => {
    let captured: { method: string; url: string; contentType: string | null; body: unknown } | null = null
    // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(
      http.post(`${API_BASE}/session`, async ({ request }) => {
        captured = {
          method: request.method,
          url: request.url,
          contentType: request.headers.get('Content-Type'),
          body: await request.json(),
        }
        return HttpResponse.json(tokenBody(LOGIN_TOKEN))
      }),
    )
    await login(VALID_USERNAME, VALID_PASSWORD)
    expect(captured).not.toBeNull()
    const seen = captured!
    expect(seen.method).toBe('POST')
    expect(seen.contentType).toContain('application/json')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/session'),
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(seen.body).toEqual({ username: VALID_USERNAME, password: VALID_PASSWORD })
    expect(seen.url).toBe(`${API_BASE}/session`)
    expect(seen.url).not.toContain(VALID_PASSWORD)
    expect(decodeURIComponent(seen.url)).not.toContain(VALID_PASSWORD)
  })

  it('on success stores the token, sets the flag, fills the session cache and returns the user', async () => {
    server.use(...sessionHandlers)
    await expect(login(VALID_USERNAME, VALID_PASSWORD)).resolves.toEqual({ username: 'john' })
    expect(getAccessToken()).toBe(LOGIN_TOKEN)
    expect(localStorage.getItem(HAS_SESSION_KEY)).toBe('1')
    expect(queryClient.getQueryData(['session'])).toEqual({ username: 'john' })
  })

  it('never writes the token to localStorage or sessionStorage; the flag is the only key', async () => {
    server.use(...sessionHandlers)
    await login(VALID_USERNAME, VALID_PASSWORD)
    expect(Object.keys(localStorage)).toEqual([HAS_SESSION_KEY])
    expect(sessionStorage.length).toBe(0)
    const everything = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(everything).not.toContain(LOGIN_TOKEN)
  })

  it('the refresh path does not write the token to storage either', async () => {
    server.use(...sessionHandlers)
    setSessionFlag()
    await restoreSession()
    expect(Object.keys(localStorage)).toEqual([HAS_SESSION_KEY])
    expect(sessionStorage.length).toBe(0)
  })

  it('rejects with an ApiError carrying the status on 401, and stores nothing', async () => {
    server.use(...sessionHandlers)
    const failure = await login(VALID_USERNAME, 'wrong').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(401)
    expect(getAccessToken()).toBeNull()
    expect(hasSessionFlag()).toBe(false)
    expect(queryClient.getQueryData(['session'])).toBeUndefined()
  })

  it('rejects with an ApiError carrying the status on 429 and on 500', async () => {
    server.use(http.post(`${API_BASE}/session`, () => new HttpResponse(null, { status: 429 })))
    const throttled = await login('a', 'b').catch((e: unknown) => e)
    expect((throttled as ApiError).status).toBe(429)

    server.use(http.post(`${API_BASE}/session`, () => new HttpResponse(null, { status: 500 })))
    const broken = await login('a', 'b').catch((e: unknown) => e)
    expect(broken).toBeInstanceOf(ApiError)
    expect((broken as ApiError).status).toBe(500)
  })

  it('on a network error rejects with something that is not an ApiError', async () => {
    server.use(http.post(`${API_BASE}/session`, () => HttpResponse.error()))
    const failure = await login('a', 'b').catch((e: unknown) => e)
    expect(failure).toBeDefined()
    expect(failure).not.toBeInstanceOf(ApiError)
  })
})

describe('logout', () => {
  function loggedIn() {
    setAccessToken('abc')
    setSessionFlag()
    queryClient.setQueryData(['session'], { username: 'john' })
    queryClient.setQueryData(['private-notes'], ['secret'])
  }

  function expectLoggedOut() {
    expect(getAccessToken()).toBeNull()
    expect(hasSessionFlag()).toBe(false)
    expect(queryClient.getQueryData(['session'])).toBeNull()
    expect(queryClient.getQueryData(['private-notes'])).toBeUndefined()
  }

  it('calls DELETE /session with credentials: include and clears everything', async () => {
    let method: string | undefined
    // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(
      http.delete(`${API_BASE}/session`, ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )
    loggedIn()
    await logout()
    expect(method).toBe('DELETE')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/session'),
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )
    expectLoggedOut()
  })

  it('clears everything even when DELETE answers 500', async () => {
    server.use(http.delete(`${API_BASE}/session`, () => new HttpResponse(null, { status: 500 })))
    loggedIn()
    await logout()
    expectLoggedOut()
  })

  it('clears everything even when DELETE fails with a network error', async () => {
    server.use(http.delete(`${API_BASE}/session`, () => HttpResponse.error()))
    loggedIn()
    await expect(logout()).resolves.toBeUndefined()
    expectLoggedOut()
  })

  it('works with the shared logout handler too', async () => {
    server.use(logoutHandler)
    loggedIn()
    await logout()
    expectLoggedOut()
  })
})
