import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, tasksHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { listTasks } from './tasks'

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
