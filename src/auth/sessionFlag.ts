import { clearLastRecipe } from '@/lib/lastRecipe'

// A "a session probably exists" hint kept in localStorage. It is NOT a token and holds no secret: only the value "1".
// It exists so the page can pick the right view on load without making visitors wait. Without it, every visitor would
// need an API call (a refresh) before we knew whether to show the dossier or the logged-in view. With it, a visitor
// who has never logged in sees the dossier at once and makes no request, and only a returning user waits for the
// refresh. Proof of login still comes from the refresh cookie and the server; this flag proves nothing, and a wrong
// flag only costs one blank moment.
export const HAS_SESSION_KEY = 'worldnamer.hasSession'

export function hasSessionFlag(): boolean {
  return localStorage.getItem(HAS_SESSION_KEY) === '1'
}

export function setSessionFlag(): void {
  localStorage.setItem(HAS_SESSION_KEY, '1')
}

// Called wherever the session ends (logout, or a refresh the server refused). The last recipe the user opened goes with
// it, so the next person to sign in on this browser is not taken to someone else's recipe id.
export function clearSessionFlag(): void {
  localStorage.removeItem(HAS_SESSION_KEY)
  clearLastRecipe()
}
