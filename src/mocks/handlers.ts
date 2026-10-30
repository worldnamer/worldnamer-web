import { http, HttpResponse } from 'msw'

// Shared MSW handlers for the login contract (specs/login-plan.md, section 3).
// They are NOT registered in server.ts by default: an empty server is what proves "no flag, no request" (an
// unhandled request fails the test). A test opts in with server.use(...sessionHandlers) or picks single handlers.

export const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`

export const VALID_USERNAME = 'john'
export const VALID_PASSWORD = 'correct horse battery'
export const LOGIN_TOKEN = 'token-from-login'
export const REFRESH_TOKEN = 'token-from-refresh'

// The body shared by login and refresh (200).
export function tokenBody(accessToken: string, username = VALID_USERNAME) {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: 900, user: { username } }
}

// The error shape: { error: { code, message } }.
export function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const noStore = { 'Cache-Control': 'no-store' }

export const loginHandler = http.post(`${API_BASE}/session`, async ({ request }) => {
  const body = (await request.json()) as { username?: string; password?: string }
  if (body.username === VALID_USERNAME && body.password === VALID_PASSWORD) {
    return HttpResponse.json(tokenBody(LOGIN_TOKEN), { headers: noStore })
  }
  return HttpResponse.json(errorBody('invalid_credentials', 'Invalid username or password.'), { status: 401 })
})

export const refreshHandler = http.post(`${API_BASE}/session/refresh`, () =>
  HttpResponse.json(tokenBody(REFRESH_TOKEN), { headers: noStore }),
)

export const logoutHandler = http.delete(`${API_BASE}/session`, () => new HttpResponse(null, { status: 204 }))

// 200 only for the token that refreshHandler hands out or loginHandler hands out; anything else is 401.
export const meHandler = http.get(`${API_BASE}/me`, ({ request }) => {
  const auth = request.headers.get('Authorization')
  if (auth === `Bearer ${REFRESH_TOKEN}` || auth === `Bearer ${LOGIN_TOKEN}`) {
    return HttpResponse.json({ user: { username: VALID_USERNAME } })
  }
  return HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 })
})

export const sessionHandlers = [loginHandler, refreshHandler, logoutHandler, meHandler]

// The habit list (specs/habit-list.md). habitsHandlers(initial) keeps one in-memory list that its handlers share, so a
// POST shows up in the next GET. Like the session handlers it is opt-in: server.use(...habitsHandlers([...])).
// completed_dates holds every date ticked for the habit, in any week; GET returns only the requested week's.
export type MockHabit = { id: number; name: string; completed_dates?: string[] }

const unauthenticated = () =>
  HttpResponse.json(errorBody('unauthenticated', 'Unauthenticated.'), { status: 401 })

// True for the two tokens the session handlers hand out.
function hasMockToken(request: Request) {
  const auth = request.headers.get('Authorization')
  return auth === `Bearer ${REFRESH_TOKEN}` || auth === `Bearer ${LOGIN_TOKEN}`
}

// The seven dates of the week that starts on `value`, or null unless `value` is a real Monday written YYYY-MM-DD.
// Written apart from src/lib/week.ts on purpose, so a mistake there cannot hide behind the same mistake here.
function mockWeek(value: string | null): string[] | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const monday = new Date(y, m - 1, d)
  const real = monday.getFullYear() === y && monday.getMonth() === m - 1 && monday.getDate() === d
  if (!real || monday.getDay() !== 1) return null
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(y, m - 1, d + i)
    return [day.getFullYear(), day.getMonth() + 1, day.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
  })
}

export function habitsHandlers(initial: MockHabit[] = []) {
  const habits = initial.map((h) => ({ id: h.id, name: h.name, completed_dates: [...(h.completed_dates ?? [])] }))

  // Requires week_start, as the API will once the old web is retired, so the tests prove the web always sends it.
  const list = http.get(`${API_BASE}/habits`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const week = mockWeek(new URL(request.url).searchParams.get('week_start'))
    if (week === null) {
      const message = 'week_start must be a Monday in the form YYYY-MM-DD.'
      return HttpResponse.json(errorBody('bad_request', message), { status: 400 })
    }
    return HttpResponse.json({
      habits: habits.map((h) => ({
        id: h.id,
        name: h.name,
        completed_dates: h.completed_dates.filter((date) => week.includes(date)).sort(),
      })),
    })
  })

  let nextId = Math.max(0, ...habits.map((h) => h.id)) + 1

  // Mirrors the API: strips the name, refuses a blank or over-100 one with 422, and answers a body without `habit` with 400.
  const create = http.post(`${API_BASE}/habits`, async ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const body = (await request.json()) as { habit?: { name?: string | null } }
    if (!body.habit) {
      return HttpResponse.json(errorBody('bad_request', 'Request body is malformed.'), { status: 400 })
    }
    const name = (body.habit.name ?? '').trim()
    if (name === '') {
      return HttpResponse.json(errorBody('validation_failed', "Name can't be blank."), { status: 422 })
    }
    if ([...name].length > 100) {
      const message = 'Name is too long (maximum is 100 characters).'
      return HttpResponse.json(errorBody('validation_failed', message), { status: 422 })
    }
    const habit = { id: nextId++, name }
    habits.push({ ...habit, completed_dates: [] })
    return HttpResponse.json({ habit }, { status: 201 })
  })

  // 204 for a habit in the list, 404 for anything else (like the API does for a missing or someone else's habit).
  const remove = http.delete(`${API_BASE}/habits/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const index = habits.findIndex((h) => String(h.id) === params.id)
    if (index === -1) return HttpResponse.json(errorBody('not_found', 'Habit not found.'), { status: 404 })
    habits.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  })

  // PUT ticks and DELETE unticks a day of a habit in the list: 204 whether or not it changed anything, 404 for any
  // other habit. The date is taken as given; the tests only send dates the grid built.
  const findHabit = (id: unknown) => habits.find((h) => String(h.id) === id)
  const notFound = () => HttpResponse.json(errorBody('not_found', 'Habit not found.'), { status: 404 })

  const tick = http.put(`${API_BASE}/habits/:id/completions/:date`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const habit = findHabit(params.id)
    if (!habit) return notFound()
    const date = String(params.date)
    if (!habit.completed_dates.includes(date)) habit.completed_dates.push(date)
    return new HttpResponse(null, { status: 204 })
  })

  const untick = http.delete(`${API_BASE}/habits/:id/completions/:date`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const habit = findHabit(params.id)
    if (!habit) return notFound()
    habit.completed_dates = habit.completed_dates.filter((date) => date !== params.date)
    return new HttpResponse(null, { status: 204 })
  })

  return [list, create, remove, tick, untick]
}

// The task lists. taskListsHandlers(initial) keeps one in-memory list, in its saved order, that its handlers share, so
// a change shows up in the next GET. Opt-in like the others: server.use(...taskListsHandlers([...])).
export type MockTaskList = { id: number; name: string }

export function taskListsHandlers(initial: MockTaskList[] = []) {
  const lists = initial.map((l) => ({ id: l.id, name: l.name }))

  const list = http.get(`${API_BASE}/task_lists`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    return HttpResponse.json({ task_lists: lists.map((l) => ({ id: l.id, name: l.name })) })
  })

  let nextId = Math.max(0, ...lists.map((l) => l.id)) + 1
  const badRequest = () => HttpResponse.json(errorBody('bad_request', 'Request body is malformed.'), { status: 400 })
  const tooLong = () =>
    HttpResponse.json(errorBody('validation_failed', 'Name is too long (maximum is 100 characters).'), { status: 422 })

  // Reads { task_list: { name } } as the API does: the name stripped, a missing one stored as "", over 100 characters
  // refused with 422, and a body without task_list answered with 400. Returns the name or the error response.
  async function nameFrom(request: Request): Promise<string | Response> {
    const body = (await request.json()) as { task_list?: { name?: string | null } }
    if (!body.task_list) return badRequest()
    const name = (body.task_list.name ?? '').trim()
    return [...name].length > 100 ? tooLong() : name
  }

  // Appends the list at the end, the way the API does.
  const create = http.post(`${API_BASE}/task_lists`, async ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const name = await nameFrom(request)
    if (name instanceof Response) return name
    const created = { id: nextId++, name }
    lists.push(created)
    return HttpResponse.json({ task_list: created }, { status: 201 })
  })

  // Renames a list in the store; any other id gets the API's 404, as a missing list or someone else's does.
  const findList = (id: unknown) => lists.find((l) => String(l.id) === id)
  const notFound = () => HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })

  const rename = http.patch(`${API_BASE}/task_lists/:id`, async ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const found = findList(params.id)
    if (!found) return notFound()
    const name = await nameFrom(request)
    if (name instanceof Response) return name
    found.name = name
    return HttpResponse.json({ task_list: { id: found.id, name: found.name } })
  })

  // Puts the lists in the order of `ids`, which must be exactly the ids in the store: anything else gets the API's 409,
  // and ids that are missing, empty or not integers get 400.
  const reorder = http.put(`${API_BASE}/task_list_order`, async ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const body = (await request.json()) as { ids?: unknown }
    const ids = body.ids
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id))) return badRequest()
    const current = lists.map((l) => l.id)
    const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id))
    if (!same) {
      return HttpResponse.json(errorBody('conflict', 'The lists have changed. Reload and try again.'), { status: 409 })
    }
    const ordered = (ids as number[]).map((id) => findList(String(id))!)
    lists.splice(0, lists.length, ...ordered)
    return HttpResponse.json({ task_lists: lists.map((l) => ({ id: l.id, name: l.name })) })
  })

  return [list, create, rename, reorder]
}
