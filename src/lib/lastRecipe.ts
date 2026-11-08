// The id of the recipe the user last opened, kept in localStorage so /recipes can reopen it. Only the id is stored,
// never any recipe text, and it is a convenience: every read and write tolerates storage being unavailable (private
// mode, blocked, full) and then simply remembers nothing.
export const LAST_RECIPE_KEY = 'worldnamer.lastRecipe'

// The saved id, or null when there is none, it is not a whole number, or storage cannot be read.
export function getLastRecipe(): string | null {
  try {
    const value = localStorage.getItem(LAST_RECIPE_KEY)
    return value !== null && /^\d+$/.test(value) ? value : null
  } catch {
    return null
  }
}

export function setLastRecipe(id: string): void {
  try {
    localStorage.setItem(LAST_RECIPE_KEY, id)
  } catch {
    // Nothing to do: the recipe just will not be reopened next time.
  }
}

export function clearLastRecipe(): void {
  try {
    localStorage.removeItem(LAST_RECIPE_KEY)
  } catch {
    // As above.
  }
}

// Forgets the saved id only if it is this one: a recipe that answered 404 must not be reopened by /recipes.
export function forgetLastRecipe(id: string): void {
  if (getLastRecipe() === id) clearLastRecipe()
}
