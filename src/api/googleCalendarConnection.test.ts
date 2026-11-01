import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, CONSENT_URL, errorBody, googleCalendarHandlers, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { getGoogleCalendarConnection, startGoogleCalendarAuthorization } from './googleCalendarConnection'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getGoogleCalendarConnection', () => {
  it.each(['not_connected', 'connected', 'lost'] as const)('resolves the status %s', async (status) => {
    server.use(...googleCalendarHandlers(status))
    expect(await getGoogleCalendarConnection()).toBe(status)
  })

  it('sends the bearer token', async () => {
    let auth: string | null = null
    server.use(
      http.get(`${API_BASE}/google_calendar_connection`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json({ google_calendar_connection: { status: 'connected' } })
      }),
    )
    await getGoogleCalendarConnection()
    expect(auth).toBe(`Bearer ${REFRESH_TOKEN}`)
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(
      http.get(`${API_BASE}/google_calendar_connection`, () =>
        HttpResponse.json(errorBody('internal_error', 'Something went wrong.'), { status: 500 }),
      ),
    )
    await expect(getGoogleCalendarConnection()).rejects.toMatchObject({ status: 500 })
    await expect(getGoogleCalendarConnection()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('startGoogleCalendarAuthorization', () => {
  it("POSTs with the bearer token and credentials: 'include' and resolves the consent address", async () => {
    let seen: { method: string; auth: string | null } | null = null
    // MSW under Node always reports request.credentials as 'same-origin', so assert on what is passed to fetch itself.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(
      http.post(`${API_BASE}/google_calendar_connection/authorization`, ({ request }) => {
        seen = { method: request.method, auth: request.headers.get('Authorization') }
        return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201 })
      }),
    )
    expect(await startGoogleCalendarAuthorization()).toBe(CONSENT_URL)
    expect(seen).toEqual({ method: 'POST', auth: `Bearer ${REFRESH_TOKEN}` })
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE}/google_calendar_connection/authorization`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(
      http.post(`${API_BASE}/google_calendar_connection/authorization`, () =>
        HttpResponse.json(errorBody('internal_error', 'Something went wrong.'), { status: 500 }),
      ),
    )
    await expect(startGoogleCalendarAuthorization()).rejects.toMatchObject({ status: 500 })
  })
})
