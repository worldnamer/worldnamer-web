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

// One calendar entry as the API sends it. A timed event carries exact instants with an offset (`starts_at`, `ends_at`);
// an all-day event carries zone-less dates, the end exclusive (`starts_on`, `ends_on`). `title` is null when Google has
// none. The API sends a window of about four days, not one day: the web picks the day.
export type TodayEvent = {
  id: string
  title: string | null
  all_day: boolean
  starts_on: string | null
  ends_on: string | null
  starts_at: string | null
  ends_at: string | null
}

// `events` is null unless the status is `connected`. `fetched_at` is when Google answered, as the API saw it.
export type TodayEventsResponse = {
  google_calendar_connection: { status: ConnectionStatus }
  events: { fetched_at: string; items: TodayEvent[] } | null
}

// GET /google_calendar_connection/events: the connection status together with the calendar entries, in one call that
// replaces the status check above for the Today card. Rejects with ApiError on a non-2xx answer; the body of an error
// is not relied on, because the edge in front of the API may replace it.
export async function getTodayEvents(): Promise<TodayEventsResponse> {
  const response = await apiFetch('/google_calendar_connection/events')
  if (!response.ok) throw await apiErrorFrom(response)
  return (await response.json()) as TodayEventsResponse
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
