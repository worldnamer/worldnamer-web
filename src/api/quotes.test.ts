import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, REFRESH_TOKEN } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { createQuote, deleteQuote, listQuotes, todayQuote } from './quotes'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

it('listQuotes resolves the quotes from GET /quotes', async () => {
  server.use(
    http.get(`${API_BASE}/quotes`, () =>
      HttpResponse.json({ quotes: [{ id: 3, text: 'Keep going.', author: '' }] }),
    ),
  )
  await expect(listQuotes()).resolves.toEqual([{ id: 3, text: 'Keep going.', author: '' }])
})

it('todayQuote resolves the quote of the day', async () => {
  server.use(
    http.get(`${API_BASE}/quotes/today`, () =>
      HttpResponse.json({ quote: { id: 4, text: 'Keep going.', author: '' } }),
    ),
  )
  await expect(todayQuote()).resolves.toEqual({ id: 4, text: 'Keep going.', author: '' })
})

it('todayQuote resolves null when there are no quotes', async () => {
  server.use(http.get(`${API_BASE}/quotes/today`, () => HttpResponse.json({ quote: null })))
  await expect(todayQuote()).resolves.toBeNull()
})

it('createQuote sends the text and author and resolves the created quote', async () => {
  let sent: unknown = null
  server.use(
    http.post(`${API_BASE}/quotes`, async ({ request }) => {
      sent = await request.json()
      return HttpResponse.json({ quote: { id: 6, text: 'Keep going.', author: 'Anon' } }, { status: 201 })
    }),
  )
  await expect(createQuote({ text: 'Keep going.', author: 'Anon' })).resolves.toEqual({
    id: 6,
    text: 'Keep going.',
    author: 'Anon',
  })
  expect(sent).toEqual({ quote: { text: 'Keep going.', author: 'Anon' } })
})

it('createQuote rejects with the server message on a 422', async () => {
  server.use(
    http.post(`${API_BASE}/quotes`, () =>
      HttpResponse.json(errorBody('validation_failed', "Text can't be blank."), { status: 422 }),
    ),
  )
  const error = await createQuote({ text: '', author: '' }).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 422, code: 'validation_failed', serverMessage: "Text can't be blank." })
})

it('deleteQuote resolves on a 204 and on a 404', async () => {
  for (const status of [204, 404]) {
    server.use(http.delete(`${API_BASE}/quotes/9`, () => new HttpResponse(null, { status })))
    await expect(deleteQuote(9)).resolves.toBeUndefined()
  }
})
