import { clearSessionFlag, hasSessionFlag, setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, ApiError, refreshSession, type SessionUser } from './client'

// POST /session. Rejects with ApiError on a non-2xx answer; a network error rejects with whatever fetch threw.
export async function login(username: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  })
  if (!response.ok) throw new ApiError(response.status)

  const body = (await response.json()) as { access_token: string; user: SessionUser }
  const user = { username: body.user.username }
  setAccessToken(body.access_token)
  setSessionFlag()
  queryClient.setQueryData(['session'], user)
  return user
}

// Used as the queryFn of the ['session'] query. With no flag there is nothing to restore, so no request is made.
export function restoreSession(): Promise<SessionUser | null> {
  if (!hasSessionFlag()) return Promise.resolve(null)
  return refreshSession()
}

// DELETE /session. The server call is best effort: whatever happens, this browser forgets the session.
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/session`, { method: 'DELETE', credentials: 'include' })
  } catch {
    // Ignored on purpose; see above.
  }
  clearAccessToken()
  clearSessionFlag()
  queryClient.clear() // drops every cached query, including private data
  queryClient.setQueryData(['session'], null)
}
