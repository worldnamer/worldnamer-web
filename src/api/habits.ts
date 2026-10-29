import { apiFetch, ApiError } from './client'

export type Habit = { id: number; name: string }

// GET /habits, oldest first. Rejects with ApiError on a non-2xx answer.
export async function listHabits(): Promise<Habit[]> {
  const response = await apiFetch('/habits')
  if (!response.ok) throw new ApiError(response.status)
  const body = (await response.json()) as { habits: Habit[] }
  return body.habits
}
