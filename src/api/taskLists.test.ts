import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { createTaskList, deleteTaskList, listTaskLists, renameTaskList, reorderTaskLists } from './taskLists'

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
})

describe('renameTaskList', () => {
  it('sends PATCH /task_lists/<id> with the name and resolves the saved list', async () => {
    let body: unknown = null
    server.use(
      http.patch(`${API_BASE}/task_lists/4`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...taskListsHandlers([{ id: 4, name: 'Chores' }]),
    )
    await expect(renameTaskList(4, ' Errands ')).resolves.toEqual({ id: 4, name: 'Errands' })
    expect(body).toEqual({ task_list: { name: ' Errands ' } })
  })
})

describe('reorderTaskLists', () => {
  it('sends PUT /task_list_order with the ids and resolves the lists in the new order', async () => {
    let body: unknown = null
    server.use(
      http.put(`${API_BASE}/task_list_order`, async ({ request }) => {
        body = await request.clone().json()
      }),
      ...taskListsHandlers([
        { id: 1, name: 'Chores' },
        { id: 2, name: 'Errands' },
      ]),
    )
    await expect(reorderTaskLists([2, 1])).resolves.toEqual([
      { id: 2, name: 'Errands' },
      { id: 1, name: 'Chores' },
    ])
    expect(body).toEqual({ ids: [2, 1] })
  })
})

describe('deleteTaskList', () => {
  it.each([204, 404])('resolves on %i', async (status) => {
    server.use(http.delete(`${API_BASE}/task_lists/9`, () => new HttpResponse(null, { status })))
    await expect(deleteTaskList(9)).resolves.toBeUndefined()
  })

  it('rejects with an ApiError on a 500', async () => {
    server.use(http.delete(`${API_BASE}/task_lists/9`, () => new HttpResponse(null, { status: 500 })))
    await expect(deleteTaskList(9)).rejects.toMatchObject({ status: 500 })
  })
})
