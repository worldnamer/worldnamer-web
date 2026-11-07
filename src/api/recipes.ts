import { apiErrorFrom, apiFetch } from './client'

// A recipe as the list shows it: just enough to pick one.
export type RecipeSummary = { id: number; title: string }

// GET /recipes: the logged-in user's recipes, ordered by title without regard to case. Rejects with ApiError on a
// non-2xx answer.
export async function listRecipes(): Promise<RecipeSummary[]> {
  const response = await apiFetch('/recipes')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { recipes: RecipeSummary[] }
  return body.recipes
}
