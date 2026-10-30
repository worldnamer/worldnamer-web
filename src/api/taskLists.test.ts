import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { API_BASE, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { listTaskLists } from './taskLists'

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
