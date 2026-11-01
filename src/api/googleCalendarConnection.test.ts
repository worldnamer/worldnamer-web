import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, googleCalendarHandlers, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { getGoogleCalendarConnection } from './googleCalendarConnection'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
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
