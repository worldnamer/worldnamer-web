import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { API_BASE, errorBody, REFRESH_TOKEN } from '@/mocks/handlers'
import { quotesHandlers } from '@/mocks/quotesHandlers'

describe('quotesHandlers', () => {
  it('quotesHandlers lists, adds and deletes quotes in memory and answers today with the first', async () => {
    server.use(...quotesHandlers([{ id: 1, text: 'First', author: 'A' }]))
    const auth = { Authorization: `Bearer ${REFRESH_TOKEN}` }
    const jsonHeaders = { ...auth, 'Content-Type': 'application/json' }

    // Without a mock token every endpoint answers 401.
    expect((await fetch(`${API_BASE}/quotes`)).status).toBe(401)
    expect((await fetch(`${API_BASE}/quotes`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401)

    // The list holds the seeded quote.
    let response = await fetch(`${API_BASE}/quotes`, { headers: auth })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ quotes: [{ id: 1, text: 'First', author: 'A' }] })

    // Today is the first quote.
    response = await fetch(`${API_BASE}/quotes/today`, { headers: auth })
    expect(await response.json()).toEqual({ quote: { id: 1, text: 'First', author: 'A' } })

    // Create trims the text and stores a missing author as "".
    response = await fetch(`${API_BASE}/quotes`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ quote: { text: '  Second  ' } }),
    })
    expect(response.status).toBe(201)
    expect((await response.json()).quote).toEqual({ id: 2, text: 'Second', author: '' })

    // A blank text is refused with 422.
    response = await fetch(`${API_BASE}/quotes`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ quote: { text: '   ', author: 'Nobody' } }),
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(errorBody('validation_failed', "Text can't be blank."))

    // A text over 500 characters is refused with 422.
    response = await fetch(`${API_BASE}/quotes`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ quote: { text: 'x'.repeat(501) } }),
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(
      errorBody('validation_failed', 'Text is too long (maximum is 500 characters).'),
    )

    // Deleting removes the quote; a second delete of the same id is 404.
    response = await fetch(`${API_BASE}/quotes/1`, { method: 'DELETE', headers: auth })
    expect(response.status).toBe(204)
    response = await fetch(`${API_BASE}/quotes/1`, { method: 'DELETE', headers: auth })
    expect(response.status).toBe(404)

    // Today now answers the next quote, and null once none are left.
    response = await fetch(`${API_BASE}/quotes/today`, { headers: auth })
    expect(await response.json()).toEqual({ quote: { id: 2, text: 'Second', author: '' } })
    await fetch(`${API_BASE}/quotes/2`, { method: 'DELETE', headers: auth })
    response = await fetch(`${API_BASE}/quotes/today`, { headers: auth })
    expect(await response.json()).toEqual({ quote: null })
  })
})
