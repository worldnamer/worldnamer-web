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

  // 204 for a list in the store, 404 for any other, including one already deleted.
  const remove = http.delete(`${API_BASE}/task_lists/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const index = lists.findIndex((l) => String(l.id) === params.id)
    if (index === -1) return notFound()
    lists.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  })

  return [list, create, rename, reorder, remove]
}

// The tasks, kept per list. tasksHandlers(initialByList) keeps one in-memory store, keyed by list id, that its
// handlers share, so a change shows up in the next GET. A list id that is not a key gets the API's 404, as a missing
// list or someone else's does. It does not see taskListsHandlers' store, so deleting a list there leaves its tasks here.
// Opt-in like the others: server.use(...tasksHandlers({ 4: [{ id: 1, text: 'Milk', done: false }] })).
// `due_on` is 'YYYY-MM-DD' or null, and null when left out.
export type MockTask = { id: number; text: string; done: boolean; due_on?: string | null }
type StoredTask = { id: number; text: string; done: boolean; due_on: string | null }

export function tasksHandlers(initialByList: Record<number, MockTask[]> = {}) {
  const byList = new Map<string, StoredTask[]>(
    Object.entries(initialByList).map(([listId, tasks]) => [listId, tasks.map((t) => ({ ...t, due_on: t.due_on ?? null }))]),
  )
  const notFound = () => HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })
  // A task as the API answers it.
  const json = (t: StoredTask) => ({ id: t.id, text: t.text, done: t.done, due_on: t.due_on })

  const list = http.get(`${API_BASE}/task_lists/:listId/tasks`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const tasks = byList.get(String(params.listId))
    if (!tasks) return notFound()
    return HttpResponse.json({ tasks: tasks.map(json) })
  })

  // One id sequence across every list, as the database has.
  let nextId = Math.max(0, ...[...byList.values()].flat().map((t) => t.id)) + 1
  const badRequest = (message = 'Request body is malformed.') =>
    HttpResponse.json(errorBody('bad_request', message), { status: 400 })
  const tooLong = () =>
    HttpResponse.json(errorBody('validation_failed', 'Text is too long (maximum is 100 characters).'), { status: 422 })

  // Text as the API stores it: stripped, a missing one as "", or the 422 for over 100 characters.
  const textFrom = (text: string | null | undefined) => {
    const stripped = (text ?? '').trim()
    return [...stripped].length > 100 ? tooLong() : stripped
  }

  // Appends an unchecked task with no due date at the end of the list. Only `text` is read from { task: { text } }; a
  // body without `task` gets 400.
  const create = http.post(`${API_BASE}/task_lists/:listId/tasks`, async ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const tasks = byList.get(String(params.listId))
    if (!tasks) return notFound()
    const body = (await request.json()) as { task?: { text?: string | null } }
    if (!body.task) return badRequest()
    const text = textFrom(body.task.text)
    if (text instanceof Response) return text
    const created = { id: nextId++, text, done: false, due_on: null }
    tasks.push(created)
    return HttpResponse.json({ task: json(created) }, { status: 201 })
  })

  // True for null or a real day written YYYY-MM-DD from 1900-01-01 to 9999-12-31, the due dates the API accepts.
  // Written apart from src/lib/isoDate.ts on purpose, so a mistake there cannot hide behind the same mistake here.
  const validDueOn = (value: unknown) => {
    if (value === null) return true
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const real = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    return real && y >= 1900
  }

  // Changes a task in the list: `text`, `done` and `due_on` if sent, the rest left as it is. A task that is not in this
  // list gets the 404 a missing one does, even when it is in another list; a body without `task`, or with an empty one,
  // gets 400, and so does a `done` that is not a JSON true or false or a `due_on` that is not a date or null.
  const update = http.patch(`${API_BASE}/task_lists/:listId/tasks/:id`, async ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const found = byList.get(String(params.listId))?.find((t) => String(t.id) === params.id)
    if (!found) return notFound()
    const body = (await request.json()) as { task?: { text?: string | null; done?: unknown; due_on?: unknown } }
    if (!body.task || Object.keys(body.task).length === 0) return badRequest()
    const { done, due_on } = body.task
    if ('done' in body.task && typeof done !== 'boolean') return badRequest('done must be true or false.')
    if ('due_on' in body.task && !validDueOn(due_on)) {
      return badRequest('due_on must be a date in the form YYYY-MM-DD, or null.')
    }
    let text = found.text
    if ('text' in body.task) {
      const stripped = textFrom(body.task.text)
      if (stripped instanceof Response) return stripped
      text = stripped
    }
    found.text = text
    if (typeof done === 'boolean') found.done = done
    if ('due_on' in body.task) found.due_on = due_on as string | null
    return HttpResponse.json({ task: json(found) })
  })

  // 204 for a task in this list; the same 404 for one already deleted, one in another list, or a list that is not a key.
  const remove = http.delete(`${API_BASE}/task_lists/:listId/tasks/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const tasks = byList.get(String(params.listId))
    const index = tasks?.findIndex((t) => String(t.id) === params.id) ?? -1
    if (!tasks || index === -1) return notFound()
    tasks.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  })

  // 204 once the list's done tasks are gone, also when none were; 404 for a list that is not a key.
  const clearDone = http.delete(`${API_BASE}/task_lists/:listId/done_tasks`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const tasks = byList.get(String(params.listId))
    if (!tasks) return notFound()
    byList.set(String(params.listId), tasks.filter((t) => !t.done))
    return new HttpResponse(null, { status: 204 })
  })

  return [list, create, update, remove, clearDone]
}

// The Google Calendar connection. googleCalendarHandlers(status, items) answers GET /google_calendar_connection/events
// with the given status and, when the status is connected, the given entries (events is null otherwise, as in the API),
// and POST /google_calendar_connection/authorization with a consent address. The status endpoint has no handler on
// purpose: the Today card must not call it, and an unhandled request fails the test. Opt-in like the others:
// server.use(...googleCalendarHandlers('connected', [timedEvent(...)])).
export const CONSENT_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=test'

export type MockConnectionStatus = 'not_connected' | 'connected' | 'lost'
export type MockEvent = {
  id: string
  title: string | null
  all_day: boolean
  starts_on: string | null
  ends_on: string | null
  starts_at: string | null
  ends_at: string | null
}

export const FETCHED_AT = '2026-11-01T16:41:07Z'

// The body of the events endpoint, for a test that answers it by hand.
export function eventsBody(status: MockConnectionStatus, items: MockEvent[] = [], fetchedAt = FETCHED_AT) {
  return {
    google_calendar_connection: { status },
    events: status === 'connected' ? { fetched_at: fetchedAt, items } : null,
  }
}

// A timed event; `startsAt` and `endsAt` are ISO 8601 strings with an offset.
export function timedEvent(id: string, title: string | null, startsAt: string, endsAt: string): MockEvent {
  return { id, title, all_day: false, starts_on: null, ends_on: null, starts_at: startsAt, ends_at: endsAt }
}

// An all-day event; `endsOn` is exclusive, as Google sends it.
export function allDayEvent(id: string, title: string | null, startsOn: string, endsOn: string): MockEvent {
  return { id, title, all_day: true, starts_on: startsOn, ends_on: endsOn, starts_at: null, ends_at: null }
}

export function googleCalendarHandlers(status: MockConnectionStatus = 'not_connected', items: MockEvent[] = []) {
  const events = http.get(`${API_BASE}/google_calendar_connection/events`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    return HttpResponse.json(eventsBody(status, items), { headers: noStore })
  })

  const start = http.post(`${API_BASE}/google_calendar_connection/authorization`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    return HttpResponse.json({ authorization_url: CONSENT_URL }, { status: 201, headers: noStore })
  })

  return [events, start]
}

// The recipes. recipesHandlers(initial) keeps one in-memory list that its handlers share. Like the API, the list answers
// only id and title, ordered by title without regard to case and then by id; show answers the whole recipe, with the
// fields left out here filled as the API does ("" and null), and the 404 a missing or someone else's recipe gets for any
// id not in the list. Opt-in like the others: server.use(...recipesHandlers([{ id: 1, title: 'Bread' }])).
export type MockRecipe = {
  id: number
  title: string
  ingredients?: { name: string; amount: string }[]
  prep_instructions?: string
  prep_minutes?: number | null
  cook_instructions?: string
  cook_minutes?: number | null
}

export function recipesHandlers(initial: MockRecipe[] = []) {
  const recipes = initial.map((r) => ({ ...r }))

  const list = http.get(`${API_BASE}/recipes`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const sorted = [...recipes].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id - b.id)
    return HttpResponse.json({ recipes: sorted.map((r) => ({ id: r.id, title: r.title })) })
  })

  const show = http.get(`${API_BASE}/recipes/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const found = recipes.find((r) => String(r.id) === params.id)
    if (!found) return HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })
    return HttpResponse.json({
      recipe: {
        id: found.id,
        title: found.title,
        ingredients: (found.ingredients ?? []).map((i) => ({ name: i.name, amount: i.amount })),
        prep_instructions: found.prep_instructions ?? '',
        prep_minutes: found.prep_minutes ?? null,
        cook_instructions: found.cook_instructions ?? '',
        cook_minutes: found.cook_minutes ?? null,
      },
    })
  })

  // Any body is ignored, as in the API. The new recipe joins the list and show handlers' array.
  let nextId = Math.max(0, ...recipes.map((r) => r.id)) + 1
  const create = http.post(`${API_BASE}/recipes`, ({ request }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const recipe = {
      id: nextId++,
      title: 'New recipe',
      ingredients: [],
      prep_instructions: '',
      prep_minutes: null,
      cook_instructions: '',
      cook_minutes: null,
    }
    recipes.push(recipe)
    return HttpResponse.json({ recipe }, { status: 201 })
  })

  // PATCH: a partial update of the shared array, validated like the API (all or nothing, a 422 with `fields` keyed
  // title, prep_instructions, prep_minutes, cook_instructions, cook_minutes, ingredients and ingredients.<i>.name|amount).
  // Text is stripped and lengths are counted by code points. A bad body is a 400, an unknown id a 404.
  const update = http.patch(`${API_BASE}/recipes/:id`, async ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const found = recipes.find((r) => String(r.id) === params.id)
    if (!found) return HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })

    const badRequest = () => HttpResponse.json(errorBody('bad_request', 'Bad request.'), { status: 400 })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest()
    }
    const sent = (body as { recipe?: unknown } | null)?.recipe
    if (typeof sent !== 'object' || sent === null || Array.isArray(sent) || Object.keys(sent).length === 0) {
      return badRequest()
    }
    const patch = sent as Record<string, unknown>
    if (
      'ingredients' in patch &&
      !(Array.isArray(patch.ingredients) && patch.ingredients.every((i) => typeof i === 'object' && i !== null))
    ) {
      return badRequest()
    }

    const errors: Record<string, string[]> = {}
    const fail = (key: string, message: string) => (errors[key] ??= []).push(message)
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value))
    const length = (value: string) => [...value].length
    const changes: MockRecipe = { id: found.id, title: found.title }

    if ('title' in patch) {
      const title = text(patch.title)
      if (title === '') fail('title', "Title can't be blank.")
      else if (length(title) > 100) fail('title', 'Title is too long (maximum is 100 characters).')
      else changes.title = title
    }
    for (const [key, label] of [
      ['prep_instructions', 'Prep instructions'],
      ['cook_instructions', 'Cook instructions'],
    ] as const) {
      if (!(key in patch)) continue
      const value = text(patch[key])
      if (length(value) > 10_000) fail(key, `${label} is too long (maximum is 10000 characters).`)
      else changes[key] = value
    }
    for (const [key, label] of [
      ['prep_minutes', 'Prep minutes'],
      ['cook_minutes', 'Cook minutes'],
    ] as const) {
      if (!(key in patch)) continue
      const value = patch[key]
      if (value === null || value === '') {
        changes[key] = null
      } else if (typeof value === 'number' ? !Number.isInteger(value) : !/^-?\d+$/.test(String(value))) {
        fail(key, `${label} must be an integer.`)
      } else if (Number(value) < 1) {
        fail(key, `${label} must be greater than 0.`)
      } else if (Number(value) > 99_999) {
        fail(key, `${label} must be less than or equal to 99999.`)
      } else {
        changes[key] = Number(value)
      }
    }
    if ('ingredients' in patch) {
      const rows = (patch.ingredients as Record<string, unknown>[]).map((row) => ({
        name: text(row.name),
        amount: text(row.amount),
      }))
      if (rows.length > 100) fail('ingredients', 'Ingredients has too many rows (maximum is 100).')
      rows.forEach((row, index) => {
        if (row.name === '') fail(`ingredients.${index}.name`, "Name can't be blank.")
        else if (length(row.name) > 100) fail(`ingredients.${index}.name`, 'Name is too long (maximum is 100 characters).')
        if (length(row.amount) > 50) fail(`ingredients.${index}.amount`, 'Amount is too long (maximum is 50 characters).')
      })
      changes.ingredients = rows
    }

    if (Object.keys(errors).length > 0) {
      const message = Object.values(errors).flat().join(' ')
      return HttpResponse.json({ error: { code: 'validation_failed', message, fields: errors } }, { status: 422 })
    }
    Object.assign(found, changes)
    return HttpResponse.json({
      recipe: {
        id: found.id,
        title: found.title,
        ingredients: (found.ingredients ?? []).map((i) => ({ name: i.name, amount: i.amount })),
        prep_instructions: found.prep_instructions ?? '',
        prep_minutes: found.prep_minutes ?? null,
        cook_instructions: found.cook_instructions ?? '',
        cook_minutes: found.cook_minutes ?? null,
      },
    })
  })

  // 204 for a recipe in the list, removing it from the shared array; the same 404 as show for any other id.
  const destroy = http.delete(`${API_BASE}/recipes/:id`, ({ request, params }) => {
    if (!hasMockToken(request)) return unauthenticated()
    const index = recipes.findIndex((r) => String(r.id) === params.id)
    if (index === -1) return HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 })
    recipes.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  })

  return [list, show, create, update, destroy]
}
