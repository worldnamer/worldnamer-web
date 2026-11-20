import { apiErrorFrom, apiFetch, ApiError } from './client'

export type Quote = { id: number; text: string; author: string }

// GET /quotes. Resolves every saved quote. Rejects with ApiError on a non-2xx answer.
export async function listQuotes(): Promise<Quote[]> {
  const response = await apiFetch('/quotes')
  if (!response.ok) throw new ApiError(response.status)
  const body = (await response.json()) as { quotes: Quote[] }
  return body.quotes
}

// GET /quotes/today. Resolves the quote of the day, or null when there is none. Rejects with ApiError on a non-2xx answer.
export async function todayQuote(): Promise<Quote | null> {
  const response = await apiFetch('/quotes/today')
  if (!response.ok) throw new ApiError(response.status)
  const body = (await response.json()) as { quote: Quote | null }
  return body.quote
}

// POST /quotes. Resolves the created quote. Rejects with ApiError on a non-2xx answer; a 422 carries the server's
// serverMessage saying what is wrong with the quote.
export async function createQuote({ text, author }: { text: string; author: string }): Promise<Quote> {
  const response = await apiFetch('/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote: { text, author } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { quote: Quote }
  return body.quote
}

// DELETE /quotes/:id. Resolves on 204 and also on 404: a quote that is already gone (another tab) is what was wanted.
export async function deleteQuote(id: number): Promise<void> {
  const response = await apiFetch(`/quotes/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw await apiErrorFrom(response)
}
