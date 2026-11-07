import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { REFRESH_TOKEN, recipesHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ApiError } from './client'
import { getRecipe, listRecipes } from './recipes'

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

describe('getRecipe', () => {
  it('resolves the recipe with every field of the contract', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(
      ...recipesHandlers([
        {
          id: 1,
          title: 'Bread',
          ingredients: [{ name: 'flour', amount: '500 g' }],
          prep_instructions: 'Mix.',
          prep_minutes: 20,
        },
      ]),
    )

    expect(await getRecipe('1')).toEqual({
      id: 1,
      title: 'Bread',
      ingredients: [{ name: 'flour', amount: '500 g' }],
      prep_instructions: 'Mix.',
      prep_minutes: 20,
      cook_instructions: '',
      cook_minutes: null,
    })
  })

  it('rejects with a 404 ApiError for an id that is not in the list', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(...recipesHandlers([{ id: 1, title: 'Bread' }]))

    await expect(getRecipe('9')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})
