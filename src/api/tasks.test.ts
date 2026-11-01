import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, REFRESH_TOKEN, tasksHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { createTask, listTasks, updateTask } from './tasks'

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
          { id: 3, text: '', done: true },
        ],
        5: [{ id: 2, text: 'Sweep', done: false }],
      }),
    )
    await expect(listTasks(4)).resolves.toEqual([
      { id: 1, text: 'Milk', done: false },
      { id: 3, text: '', done: true },
    ])
    expect(auth).toBe(`Bearer ${REFRESH_TOKEN}`)
  })

  it('rejects with the status of a 404 (not one of the lists)', async () => {
    server.use(...tasksHandlers({}))
    await expect(listTasks(4)).rejects.toMatchObject({ status: 404 })
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
    await expect(createTask(4, ' Bread ')).resolves.toEqual({ id: 8, text: 'Bread', done: false })
    expect(body).toEqual({ task: { text: ' Bread ' } })
    await expect(listTasks(4)).resolves.toEqual([
      { id: 7, text: 'Milk', done: true },
      { id: 8, text: 'Bread', done: false },
    ])
  })

  it('rejects with the status, code and message of a 422', async () => {
    server.use(...tasksHandlers({ 4: [] }))
    const error = await createTask(4, 'x'.repeat(101)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_failed',
      serverMessage: 'Text is too long (maximum is 100 characters).',
    })
  })

  it('rejects with the status of a 404 for a list that is not one of the lists', async () => {
    server.use(
      http.post(`${API_BASE}/task_lists/5/tasks`, () =>
        HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
      ),
    )
    await expect(createTask(5, 'Bread')).rejects.toMatchObject({ status: 404 })
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
    await expect(updateTask(4, 7, { text: ' Oat milk ' })).resolves.toEqual({ id: 7, text: 'Oat milk', done: true })
    expect(body).toEqual({ task: { text: ' Oat milk ' } })
  })

  it('rejects with the status of a 404 for a task that is not in the list', async () => {
    server.use(...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: false }], 5: [] }))
    await expect(updateTask(5, 7, { text: 'x' })).rejects.toMatchObject({ status: 404 })
  })

  it('rejects with the message of a 422', async () => {
    server.use(...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: false }] }))
    await expect(updateTask(4, 7, { text: 'x'.repeat(101) })).rejects.toMatchObject({
      status: 422,
      serverMessage: 'Text is too long (maximum is 100 characters).',
    })
  })
})

describe('updateTask with done', () => {
  it('checks and unchecks a task, leaving its text', async () => {
    server.use(...tasksHandlers({ 4: [{ id: 7, text: 'Milk', done: false }] }))
    await expect(updateTask(4, 7, { done: true })).resolves.toEqual({ id: 7, text: 'Milk', done: true })
    await expect(updateTask(4, 7, { done: false })).resolves.toEqual({ id: 7, text: 'Milk', done: false })
  })
})
