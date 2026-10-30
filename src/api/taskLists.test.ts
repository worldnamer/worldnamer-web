import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, errorBody, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { createTaskList, listTaskLists } from './taskLists'

beforeEach(() => {
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

describe('listTaskLists', () => {
  it('sends the bearer token and resolves the lists in order', async () => {
    let auth: string | null = null
    server.use(
      http.get(`${API_BASE}/task_lists`, ({ request }) => {
        auth = request.headers.get('Authorization')
      }),
      ...taskListsHandlers([
        { id: 3, name: 'Chores' },
        { id: 1, name: '' },
      ]),
    )
    await expect(listTaskLists()).resolves.toEqual([
      { id: 3, name: 'Chores' },
      { id: 1, name: '' },
    ])
    expect(auth).toBe(`Bearer ${REFRESH_TOKEN}`)
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.get(`${API_BASE}/task_lists`, () => new HttpResponse(null, { status: 500 })))
    await expect(listTaskLists()).rejects.toMatchObject({ status: 500 })
  })
})

describe('createTaskList', () => {
  it('sends the name as JSON and resolves the created list', async () => {
    let body: unknown = null
    server.use(
      http.post(`${API_BASE}/task_lists`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...taskListsHandlers([{ id: 4, name: 'Chores' }]),
    )
    await expect(createTaskList(' Groceries ')).resolves.toEqual({ id: 5, name: 'Groceries' })
    expect(body).toEqual({ task_list: { name: ' Groceries ' } })
  })

  it('rejects with the status, code and message of a 422', async () => {
    server.use(
      http.post(`${API_BASE}/task_lists`, () =>
        HttpResponse.json(errorBody('validation_failed', 'Name is too long (maximum is 100 characters).'), {
          status: 422,
        }),
      ),
    )
    const error = await createTaskList('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, serverMessage: 'Name is too long (maximum is 100 characters).' })
  })
})
