import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { createHabit, deleteHabit } from './habits'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

describe('createHabit', () => {
  it('resolves the created habit', async () => {
    server.use(http.post(`${API_BASE}/habits`, () => HttpResponse.json({ habit: { id: 5, name: 'Stretch' } }, { status: 201 })))
    await expect(createHabit(' Stretch ')).resolves.toEqual({ id: 5, name: 'Stretch' })
  })

  it('rejects with the status, code and message of an error body', async () => {
    server.use(
      http.post(`${API_BASE}/habits`, () =>
        HttpResponse.json(errorBody('validation_failed', "Name can't be blank."), { status: 422 }),
      ),
    )
    const error = await createHabit('').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', serverMessage: "Name can't be blank." })
  })

  it.each([
    ['no body', () => new HttpResponse(null, { status: 500 })],
    ['a body that is not JSON', () => new HttpResponse('<html>oops</html>', { status: 502 })],
    ['JSON of another shape', () => HttpResponse.json({ error: 'nope' }, { status: 500 })],
  ])('rejects with only the status for %s', async (_label, answer) => {
    server.use(http.post(`${API_BASE}/habits`, answer))
    const error = await createHabit('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBeUndefined()
    expect((error as ApiError).serverMessage).toBeUndefined()
  })
})

describe('deleteHabit', () => {
  it.each([204, 404])('resolves on %i', async (status) => {
    server.use(http.delete(`${API_BASE}/habits/9`, () => new HttpResponse(null, { status })))
    await expect(deleteHabit(9)).resolves.toBeUndefined()
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.delete(`${API_BASE}/habits/9`, () => new HttpResponse(null, { status: 500 })))
    await expect(deleteHabit(9)).rejects.toMatchObject({ status: 500 })
  })
})
