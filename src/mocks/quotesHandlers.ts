import { http, HttpResponse } from 'msw'
import { API_BASE, errorBody, LOGIN_TOKEN, REFRESH_TOKEN } from '@/mocks/handlers'

// The quotes. quotesHandlers(initial) keeps one in-memory list that its handlers share, so a POST shows up in the next
// GET. Today is the first quote in the list. Opt-in like the others: server.use(...quotesHandlers([{ id: 1, text: 'Hi' }])).
export type MockQuote = { id: number; text: string; author?: string }

const unauthenticated = () => HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 })

// True for the two tokens the session handlers hand out.
function hasMockToken(request: Request) {
  const auth = request.headers.get('Authorization')
  return auth === `Bearer ${REFRESH_TOKEN}` || auth === `Bearer ${LOGIN_TOKEN}`
}

export function quotesHandlers(initial: MockQuote[] = []) {
  const quotes = initial.map((q) => ({ id: q.id, text: q.text, author: q.author ?? '' }))

  const list = http.get(`${API_BASE}/quotes`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    return HttpResponse.json({ quotes })
  })

  const today = http.get(`${API_BASE}/quotes/today`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    return HttpResponse.json({ quote: quotes[0] ?? null })
  })

  // Strips the text and the author, as the API does. A missing author is stored as "".
  let nextId = Math.max(0, ...quotes.map((q) => q.id)) + 1
  const create = http.post(`${API_BASE}/quotes`, async ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const body = (await request.json()) as { quote?: { text?: string | null; author?: string | null } }
    const text = (body.quote?.text ?? '').trim()
    if (text === '') {
      return HttpResponse.json(errorBody('validation_failed', "Text can't be blank."), { status: 422 })
    }
    if ([...text].length > 500) {
      const message = 'Text is too long (maximum is 500 characters).'
      return HttpResponse.json(errorBody('validation_failed', message), { status: 422 })
    }
    const quote = { id: nextId++, text, author: (body.quote?.author ?? '').trim() }
    quotes.push(quote)
    return HttpResponse.json({ quote }, { status: 201 })
  })

  // 204 for a quote in the list; the same 404 for any other id, including one already deleted.
  const remove = http.delete(`${API_BASE}/quotes/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const index = quotes.findIndex((q) => String(q.id) === params.id)
    if (index === -1) return HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })
    quotes.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  })

  return [list, today, create, remove]
}
