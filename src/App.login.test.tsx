// TESTS FOR web-2 (login UI). They drive the whole <App /> through the browser-facing contract below, so the
// implementer is free to split the code as they like. What is BINDING is what a user (or a screen reader) sees.
//
// BINDING CONTRACT (all found by role / label / text, never by CSS class):
//   Logged out header:  a control with role "button" and accessible name "Login", next to the Résumé link.
//   Login dialog:       role "dialog" (opened by that button), containing
//                         - a text input labelled "Username"
//                         - an input labelled "Password" with type="password"
//                         - buttons named "Login" and "Cancel"
//                         - a real <form method="post"> around the fields whose submit handler calls
//                           event.preventDefault() (so a password can never end up in the URL)
//                         - on failure, an element with role "alert" holding loginErrorMessage(status) text
//                           (src/auth/errors.ts); the dialog stays open
//   Logged in header:   a button with accessible name "Account menu" (replaces the Login button). Activating it
//                       opens a Radix DropdownMenu: the username as PLAIN TEXT (not a link, button or menuitem)
//                       and exactly one menuitem, "Log out".
//   "/" route:          logged out -> the dossier (region "About John"); logged in -> the placeholder
//                       <section aria-label="Logged-in home"> (role "region", name "Logged-in home"), empty for now.
//   "/resume":          identical in every auth state; never waits for the session.
//   Session restore:    uses the shared queryClient (src/lib/queryClient.ts) and restoreSession from web-1.
//                       No hasSession flag -> dossier + Login button at once, NO request at all.
//                       Flag set and refresh pending -> NONE of dossier, Login button, Account menu is rendered
//                       (an empty reserved slot). Then 200 -> logged-in view + menu; 401 -> dossier + Login, flag cleared.
//
// SUGGESTED (not tested directly) file layout, follow it unless there is a reason not to:
//   src/auth/useSession.ts            useSession(): { pending: boolean; user: SessionUser | null }
//                                     (useQuery(['session'], restoreSession, { enabled/retry/staleTime as in the plan }))
//   src/components/LoginDialog.tsx    shadcn Dialog + the form (controlled state for the two fields)
//   src/components/AccountMenu.tsx    shadcn DropdownMenu
//   src/components/Header.tsx         shows slot: pending -> empty, user -> AccountMenu, none -> Login button
//   src/pages/Home.tsx                dossier or the logged-in placeholder
//   src/components/LoggedInHome.tsx   the placeholder
//
// Tests share the real queryClient (the same one web-1's session functions write to) and reset it between tests.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { hasSessionFlag, setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import {
  API_BASE,
  VALID_PASSWORD,
  VALID_USERNAME,
  loginHandler,
  logoutHandler,
  refreshHandler,
  tokenBody,
  errorBody,
  habitsHandlers,
} from '@/mocks/handlers'
import { server } from '@/mocks/server'

function renderApp(route = '/') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  queryClient.clear()
})

const dossier = () => screen.queryByRole('region', { name: 'About John' })
const loggedInView = () => screen.queryByRole('region', { name: 'Logged-in home' })
const loginButton = () => screen.queryByRole('button', { name: 'Login' })
const accountMenu = () => screen.queryByRole('button', { name: 'Account menu' })

// A gate that holds a handler's answer until the test opens it, and tells the test when the request arrived.
function gate() {
  let open!: () => void
  let arrived!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  const requested = new Promise<void>((resolve) => (arrived = resolve))
  return { open, opened, arrived, requested }
}

// Logged in the way John is on a reload: flag set, refresh answers 200.
async function renderLoggedIn(route = '/') {
  setSessionFlag()
  server.use(refreshHandler, logoutHandler, ...habitsHandlers())
  renderApp(route)
  return screen.findByRole('button', { name: 'Account menu' })
}

async function openLoginDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Login' }))
  return screen.findByRole('dialog')
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  username: string,
  password: string,
) {
  await user.type(within(dialog).getByLabelText('Username'), username)
  await user.type(within(dialog).getByLabelText('Password'), password)
  await user.click(within(dialog).getByRole('button', { name: 'Login' }))
}

describe('logged out', () => {
  it('never asks for the habit list', async () => {
    const requests: string[] = []
    server.events.on('request:start', ({ request }) => requests.push(new URL(request.url).pathname))
    renderApp()

    await new Promise((resolve) => setTimeout(resolve, 50))
    server.events.removeAllListeners()

    expect(dossier()).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Habits' })).not.toBeInTheDocument()
    expect(requests.filter((path) => path.endsWith('/habits'))).toEqual([])
  })

  it('shows the dossier and a Login button beside Résumé, with no menu', () => {
    renderApp()

    expect(dossier()).toBeInTheDocument()
    expect(loginButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Résumé' })).toBeInTheDocument()
    expect(accountMenu()).not.toBeInTheDocument()
    expect(loggedInView()).not.toBeInTheDocument()
  })

  it('opens a modal with username, password and Login / Cancel buttons', async () => {
    const user = userEvent.setup()
    renderApp()

    const dialog = await openLoginDialog(user)

    expect(within(dialog).getByLabelText('Username')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(within(dialog).getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('closes the modal and clears the fields and any error on Cancel', async () => {
    const user = userEvent.setup()
    server.use(loginHandler)
    renderApp()

    let dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, 'john', 'wrong password')
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Username'), 'more')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    dialog = await openLoginDialog(user)
    expect(within(dialog).getByLabelText('Username')).toHaveValue('')
    expect(within(dialog).getByLabelText('Password')).toHaveValue('')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('login form', () => {
  it('is a real post form and a submit does not navigate or put the password in the URL', async () => {
    const user = userEvent.setup()
    server.use(loginHandler)
    const submits: boolean[] = []
    const onSubmit = (event: Event) => submits.push(event.defaultPrevented)
    // React handles submit at the app root; this listener on document runs after it, so it sees the final state.
    document.addEventListener('submit', onSubmit)
    const urlBefore = window.location.href
    renderApp()

    const dialog = await openLoginDialog(user)
    const form = dialog.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')?.toLowerCase()).toBe('post')

    await fillAndSubmit(user, dialog, 'john', 'a-password-that-must-not-leak')
    await waitFor(() => expect(submits.length).toBeGreaterThan(0))
    document.removeEventListener('submit', onSubmit)

    expect(submits.every(Boolean)).toBe(true) // defaultPrevented on every submit
    expect(window.location.href).toBe(urlBefore)
    expect(window.location.href).not.toContain('a-password-that-must-not-leak')
  })

  it('can be submitted with Enter from the password field', async () => {
    const user = userEvent.setup()
    server.use(loginHandler, logoutHandler, ...habitsHandlers())
    renderApp()

    const dialog = await openLoginDialog(user)
    await user.type(within(dialog).getByLabelText('Username'), VALID_USERNAME)
    await user.type(within(dialog).getByLabelText('Password'), `${VALID_PASSWORD}{Enter}`)

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  it('shows one generic message for wrong credentials and stays open', async () => {
    const user = userEvent.setup()
    server.use(loginHandler)
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, 'john', 'wrong password')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid username or password.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(loginButton()).toBeInTheDocument()
    expect(hasSessionFlag()).toBe(false)
  })

  it('shows the throttle message for 429', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${API_BASE}/session`, () =>
        HttpResponse.json(errorBody('throttled', 'Retry later.'), { status: 429 }),
      ),
    )
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, 'john', 'x')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in a few minutes.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the generic message for a server error', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/session`, () => new HttpResponse(null, { status: 500 })))
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, 'john', 'x')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the generic message for a network error', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE}/session`, () => HttpResponse.error()))
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, 'john', 'x')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('successful login', () => {
  it('closes the modal, swaps Login for the account menu and shows the logged-in view', async () => {
    const user = userEvent.setup()
    server.use(loginHandler, logoutHandler, ...habitsHandlers())
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, VALID_USERNAME, VALID_PASSWORD)

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(loginButton()).not.toBeInTheDocument()
    expect(loggedInView()).toBeInTheDocument()
    expect(dossier()).not.toBeInTheDocument()
  })

  it('shows the username as plain text, then Log out, in the menu', async () => {
    const user = userEvent.setup()
    server.use(loginHandler, logoutHandler, ...habitsHandlers())
    renderApp()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, VALID_USERNAME, VALID_PASSWORD)
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))

    const menu = await screen.findByRole('menu')
    const name = within(menu).getByText(VALID_USERNAME)
    expect(name.closest('a, button, [role="menuitem"]')).toBeNull()
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })
})

describe('log out', () => {
  async function openMenuAndLogOut() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
  }

  it('calls DELETE /session, then shows the Login button and the dossier again', async () => {
    let deleted = 0
    setSessionFlag()
    server.use(
      refreshHandler,
      ...habitsHandlers(),
      http.delete(`${API_BASE}/session`, () => {
        deleted += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp()

    await openMenuAndLogOut()

    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(deleted).toBe(1)
    expect(dossier()).toBeInTheDocument()
    expect(loggedInView()).not.toBeInTheDocument()
    expect(accountMenu()).not.toBeInTheDocument()
    expect(hasSessionFlag()).toBe(false)
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('still logs out when the DELETE fails with %s', async (_label, answer) => {
    setSessionFlag()
    server.use(refreshHandler, ...habitsHandlers(), http.delete(`${API_BASE}/session`, answer))
    renderApp()

    await openMenuAndLogOut()

    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(dossier()).toBeInTheDocument()
    expect(accountMenu()).not.toBeInTheDocument()
  })
})

describe('session restore on page load', () => {
  it('with no flag shows the dossier and Login at once and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const requests: string[] = []
    server.events.on('request:start', ({ request }) => requests.push(request.url))
    renderApp()

    // Synchronously, before any await: nothing waits for the network.
    expect(dossier()).toBeInTheDocument()
    expect(loginButton()).toBeInTheDocument()

    // Give a (wrongly) started request time to show up.
    await new Promise((resolve) => setTimeout(resolve, 50))
    server.events.removeAllListeners()

    expect(requests).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(dossier()).toBeInTheDocument()
    expect(loginButton()).toBeInTheDocument()
  })

  it('with the flag and a 200 refresh shows the logged-in view and the menu', async () => {
    await renderLoggedIn()

    expect(loggedInView()).toBeInTheDocument()
    expect(dossier()).not.toBeInTheDocument()
    expect(loginButton()).not.toBeInTheDocument()
    expect(hasSessionFlag()).toBe(true)
  })

  it('with the flag shows neither the dossier, Login nor the menu while the refresh is pending', async () => {
    const g = gate()
    setSessionFlag()
    server.use(
      ...habitsHandlers(),
      http.post(`${API_BASE}/session/refresh`, async () => {
        g.arrived()
        await g.opened
        return HttpResponse.json(tokenBody('token-from-refresh'))
      }),
    )
    renderApp()

    await g.requested
    expect(dossier()).not.toBeInTheDocument()
    expect(loginButton()).not.toBeInTheDocument()
    expect(accountMenu()).not.toBeInTheDocument()
    expect(loggedInView()).not.toBeInTheDocument()
    // The rest of the page (the header, the logo link) is still there.
    expect(screen.getByRole('link', { name: 'Résumé' })).toBeInTheDocument()

    g.open()
    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument()
    expect(loggedInView()).toBeInTheDocument()
  })

  it('with the flag and a 401 refresh shows the dossier and Login, and clears the flag', async () => {
    setSessionFlag()
    server.use(
      http.post(`${API_BASE}/session/refresh`, () =>
        HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 }),
      ),
    )
    renderApp()

    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(dossier()).toBeInTheDocument()
    expect(accountMenu()).not.toBeInTheDocument()
    expect(hasSessionFlag()).toBe(false)
  })
})

describe('habit list', () => {
  it('is fetched again after logging out and logging in again', async () => {
    const user = userEvent.setup()
    let fetches = 0
    setSessionFlag()
    server.use(
      refreshHandler,
      loginHandler,
      logoutHandler,
      // Counts the request, then returns nothing so the next handler (the habits list) answers it.
      http.get(`${API_BASE}/habits`, () => {
        fetches += 1
      }),
      ...habitsHandlers([{ id: 1, name: 'Stretch' }]),
    )
    renderApp()
    expect(await screen.findByText('Stretch')).toBeInTheDocument()
    expect(fetches).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(screen.queryByText('Stretch')).not.toBeInTheDocument()

    const dialog = await openLoginDialog(user)
    await fillAndSubmit(user, dialog, VALID_USERNAME, VALID_PASSWORD)

    expect(await screen.findByText('Stretch')).toBeInTheDocument()
    expect(fetches).toBe(2)
  })
})

describe('/resume in every auth state', () => {
  const resumeHeading = () => screen.queryByRole('heading', { name: 'John LeBoeuf-Little' })

  it('renders when logged out', () => {
    renderApp('/resume')

    expect(resumeHeading()).toBeInTheDocument()
    expect(dossier()).not.toBeInTheDocument()
    expect(loggedInView()).not.toBeInTheDocument()
  })

  it('renders at once while the session is still being restored', async () => {
    const g = gate()
    setSessionFlag()
    server.use(
      ...habitsHandlers(),
      http.post(`${API_BASE}/session/refresh`, async () => {
        g.arrived()
        await g.opened
        return HttpResponse.json(tokenBody('token-from-refresh'))
      }),
    )
    renderApp('/resume')

    expect(resumeHeading()).toBeInTheDocument() // before the refresh answers
    await g.requested
    expect(resumeHeading()).toBeInTheDocument()
    g.open()
    await screen.findByRole('button', { name: 'Account menu' })
    expect(resumeHeading()).toBeInTheDocument()
  })

  it('renders the same when logged in, and without the logged-in placeholder', async () => {
    await renderLoggedIn('/resume')

    expect(resumeHeading()).toBeInTheDocument()
    expect(loggedInView()).not.toBeInTheDocument()
    expect(dossier()).not.toBeInTheDocument()
  })
})

