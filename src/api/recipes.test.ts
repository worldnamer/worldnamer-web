import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, REFRESH_TOKEN, recipesHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { createTaskListFromRecipe, getRecipe, listRecipes, updateRecipe } from './recipes'

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
})

describe('updateRecipe', () => {
  it('sends the patch as JSON under recipe and resolves the recipe as saved', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(...recipesHandlers([{ id: 1, title: 'Bread' }]))

    expect(await updateRecipe('1', { title: ' Rye ', prep_minutes: 20 })).toEqual({
      id: 1,
      title: 'Rye',
      ingredients: [],
      prep_instructions: '',
      prep_minutes: 20,
      cook_instructions: '',
      cook_minutes: null,
    })
  })

  it('rejects a 422 with the API fields on the ApiError', async () => {
    setAccessToken(REFRESH_TOKEN)
    server.use(...recipesHandlers([{ id: 1, title: 'Bread' }]))

    await expect(updateRecipe('1', { title: 'x'.repeat(101) })).rejects.toMatchObject({
      status: 422,
      code: 'validation_failed',
      fields: { title: ['Title is too long (maximum is 100 characters).'] },
    })
  })
})

describe('createTaskListFromRecipe', () => {
  it('posts to the recipe with no body and resolves the new list', async () => {
    setAccessToken(REFRESH_TOKEN)
    let seen: { url: string; body: string } | undefined
    server.use(
      http.post(`${API_BASE}/recipes/:id/task_list`, async ({ request }) => {
        seen = { url: new URL(request.url).pathname, body: await request.text() }
        return HttpResponse.json({ task_list: { id: 9, name: 'Stew' } }, { status: 201 })
      }),
    )

    expect(await createTaskListFromRecipe(4)).toEqual({ id: 9, name: 'Stew' })
    expect(seen).toEqual({ url: '/api/v1/recipes/4/task_list', body: '' })
  })
})
