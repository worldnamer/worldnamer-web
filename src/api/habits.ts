import { apiErrorFrom, apiFetch, ApiError } from './client'

export type Habit = { id: number; name: string }

// GET /habits, oldest first. Rejects with ApiError on a non-2xx answer.
export async function listHabits(): Promise<Habit[]> {
  const response = await apiFetch('/habits')
  if (!response.ok) throw new ApiError(response.status)
  const body = (await response.json()) as { habits: Habit[] }
  return body.habits
}

// POST /habits. Resolves the created habit (the name comes back with surrounding spaces stripped). A 422 rejects with
// an ApiError whose serverMessage says what is wrong with the name.
export async function createHabit(name: string): Promise<Habit> {
  const response = await apiFetch('/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ habit: { name } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { habit: Habit }
  return body.habit
}

// DELETE /habits/:id. Resolves on 204 and also on 404: a habit that is already gone (another tab) is what was wanted.
export async function deleteHabit(id: number): Promise<void> {
  const response = await apiFetch(`/habits/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw await apiErrorFrom(response)
}
