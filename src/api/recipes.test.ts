import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { REFRESH_TOKEN, recipesHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { listRecipes } from './recipes'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
})

describe('listRecipes', () => {
  it('resolves the recipes as id and title', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(...recipesHandlers([{ id: 1, title: 'bread' }, { id: 3, title: 'Apple pie' }]))

    expect(await listRecipes()).toEqual([
      { id: 3, title: 'Apple pie' },
      { id: 1, title: 'bread' },
    ])
  })

  it('resolves an empty list', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(...recipesHandlers())

    expect(await listRecipes()).toEqual([])
  })

  it('rejects with an ApiError carrying the status when not logged in', async () => {
    server.use(...recipesHandlers())

    await expect(listRecipes()).rejects.toBeInstanceOf(ApiError)
  })
})
