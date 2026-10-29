// The access token lives here, in a plain module variable, and nowhere else: never in React state, localStorage or
// sessionStorage. A page reload empties it on purpose; restoreSession() gets a new one from the refresh cookie.
// Anything on the page that can read storage (an XSS bug, a browser extension) could steal a stored token.
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}
