import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, tasksHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { clearDoneTasks, createTask, deleteTask, listTasks, updateTask } from './tasks'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

describe('listTasks', () => {
  it("sends the bearer token and resolves the list's tasks in order", async () => {
    let auth: string | null = null
    server.use(
      http.get(`${API_BASE}/task_lists/4/tasks`, ({ request }) => {
        auth = request.headers.get('Authorization')
      }),
      ...tasksHandlers({
        4: [
          { id: 1, text: 'Milk', done: false },
          { id: 3, text: '', done: true, due_on: '2026-11-05' },
        ],
        5: [{ id: 2, text: 'Sweep', done: false }],
      }),
    )
    await expect(listTasks(4)).resolves.toEqual([
      { id: 1, text: 'Milk', done: false, due_on: null },
      { id: 3, text: '', done: true, due_on: '2026-11-05' },
    ])
    expect(auth).toBe(`Bearer ${REFRESH_TOKEN}`)
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.get(`${API_BASE}/task_lists/4/tasks`, () => new HttpResponse(null, { status: 500 })))
    await expect(listTasks(4)).rejects.toMatchObject({ status: 500 })
  })
})

describe('createTask', () => {
  it('sends the text as JSON to the list and resolves the created task, unchecked and last', async () => {
    let body: unknown = null
    server.use(
      http.post(`${API_BASE}/task_lists/4/tasks`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: true }] }),
    )
    await expect(createTask(4, ' Bread ')).resolves.toEqual({ id: 8, text: 'Bread', done: false, due_on: null })
    expect(body).toEqual({ task: { text: ' Bread ' } })
    await expect(listTasks(4)).resolves.toEqual([
      { id: 7, text: 'Milk', done: true, due_on: null },
      { id: 8, text: 'Bread', done: false, due_on: null },
    ])
  })
})

describe('updateTask', () => {
  it('sends only the changes given, to the task in its list, and resolves the task as saved', async () => {
    let body: unknown = null
    server.use(
      http.patch(`${API_BASE}/task_lists/4/tasks/7`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: true }] }),
    )
    await expect(updateTask(4, 7, { text: ' Oat milk ' })).resolves.toEqual({
      id: 7,
      text: 'Oat milk',
      done: true,
      due_on: null,
    })
    expect(body).toEqual({ task: { text: ' Oat milk ' } })
  })
})

describe('deleteTask', () => {
  it('sends DELETE to the task in its list and resolves as deleted; the task is gone and the others stay', async () => {
    let method: string | null = null
    server.use(
      http.delete(`${API_BASE}/task_lists/4/tasks/7`, ({ request }) => {
        method = request.method
      }),
      ...tasksHandlers({
        4: [
          { id: 7, text: 'Milk', done: false },
          { id: 8, text: 'Eggs', done: false },
        ],
        5: [{ id: 9, text: 'Sweep', done: false }],
      }),
    )
    await expect(deleteTask(4, 7)).resolves.toEqual({ alreadyGone: false })
    expect(method).toBe('DELETE')
    await expect(listTasks(4)).resolves.toEqual([{ id: 8, text: 'Eggs', done: false, due_on: null }])
    await expect(listTasks(5)).resolves.toHaveLength(1)
  })

  it('resolves as already gone on a 404, such as a second delete of the same task', async () => {
    server.use(...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: false }] }))
    await deleteTask(4, 7)
    await expect(deleteTask(4, 7)).resolves.toEqual({ alreadyGone: true })
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.delete(`${API_BASE}/task_lists/4/tasks/7`, () => new HttpResponse(null, { status: 500 })))
    const error = await deleteTask(4, 7).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})

describe('clearDoneTasks', () => {
  it("sends DELETE to the list's done tasks and resolves as cleared; the undone and other lists stay", async () => {
    let method: string | null = null
    server.use(
      http.delete(`${API_BASE}/task_lists/4/done_tasks`, ({ request }) => {
        method = request.method
      }),
      ...tasksHandlers({
        4: [
          { id: 7, text: 'Milk', done: true },
          { id: 8, text: 'Eggs', done: false },
        ],
        5: [{ id: 9, text: 'Sweep', done: true }],
      }),
    )
    await expect(clearDoneTasks(4)).resolves.toEqual({ alreadyGone: false })
    expect(method).toBe('DELETE')
    await expect(listTasks(4)).resolves.toEqual([{ id: 8, text: 'Eggs', done: false, due_on: null }])
    await expect(listTasks(5)).resolves.toHaveLength(1)
  })

  it('resolves as already gone on a 404, such as a list deleted elsewhere', async () => {
    server.use(...tasksHandlers({}))
    await expect(clearDoneTasks(4)).resolves.toEqual({ alreadyGone: true })
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.delete(`${API_BASE}/task_lists/4/done_tasks`, () => new HttpResponse(null, { status: 500 })))
    const error = await clearDoneTasks(4).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})

describe('updateTask with done', () => {
  it('checks and unchecks a task, leaving its text', async () => {
    server.use(...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: false }] }))
    await expect(updateTask(4, 7, { done: true })).resolves.toEqual({ id: 7, text: 'Milk', done: true, due_on: null })
    await expect(updateTask(4, 7, { done: false })).resolves.toEqual({ id: 7, text: 'Milk', done: false, due_on: null })
  })
})

describe('updateTask with due_on', () => {
  it('sets a due date, sending only due_on, and leaves the text and done', async () => {
    let body: unknown = null
    server.use(
      http.patch(`${API_BASE}/task_lists/4/tasks/7`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: true }] }),
    )
    await expect(updateTask(4, 7, { due_on: '2026-11-05' })).resolves.toEqual({
      id: 7,
      text: 'Milk',
      done: true,
      due_on: '2026-11-05',
    })
    expect(body).toEqual({ task: { due_on: '2026-11-05' } })
    await expect(listTasks(4)).resolves.toEqual([{ id: 7, text: 'Milk', done: true, due_on: '2026-11-05' }])
  })
})
