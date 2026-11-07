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

export type RecipeIngredient = { name: string; amount: string }

// A whole recipe. amount and both instruction fields are always strings (possibly ""); the minutes are a whole number
// or null when not given.
export type Recipe = {
  id: number
  title: string
  ingredients: RecipeIngredient[]
  prep_instructions: string
  prep_minutes: number | null
  cook_instructions: string
  cook_minutes: number | null
}

// GET /recipes/:id. Rejects with ApiError otherwise; a 404 means there is no such recipe among the user's (missing,
// not a number, or someone else's: the API does not say which).
export async function getRecipe(id: string): Promise<Recipe> {
  const response = await apiFetch(`/recipes/${encodeURIComponent(id)}`)
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { recipe: Recipe }
  return body.recipe
}

// POST /recipes: makes a recipe titled "New recipe" for the logged-in user and returns it. Sends no body: the API
// accepts no fields. Rejects with ApiError otherwise.
export async function createRecipe(): Promise<Recipe> {
  const response = await apiFetch('/recipes', { method: 'POST' })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { recipe: Recipe }
  return body.recipe
}
