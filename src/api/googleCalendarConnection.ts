import { apiErrorFrom, apiFetch } from './client'

// What the API says about the user's Google Calendar link. `lost` means Google no longer accepts the stored token.
export type ConnectionStatus = 'not_connected' | 'connected' | 'lost'

// GET /google_calendar_connection. For a stored token the API asks Google whether it still works, so this call can be
// slow; the card's query limits how often it runs. Rejects with ApiError on a non-2xx answer.
export async function getGoogleCalendarConnection(): Promise<ConnectionStatus> {
  const response = await apiFetch('/google_calendar_connection')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { google_calendar_connection: { status: ConnectionStatus } }
  return body.google_calendar_connection.status
}

// POST /google_calendar_connection/authorization starts the connect flow. Resolves Google's consent address, which the
// caller sends the browser to. credentials: 'include' is required: the API answers with the wn_google_oauth cookie that
// ties the flow to this browser, and a cross-origin fetch ignores Set-Cookie without it.
export async function startGoogleCalendarAuthorization(): Promise<string> {
  const response = await apiFetch('/google_calendar_connection/authorization', {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { authorization_url: string }
  return body.authorization_url
}
