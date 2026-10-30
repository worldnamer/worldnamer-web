import { apiErrorFrom, apiFetch, ApiError } from './client'

export type Habit = { id: number; name: string }

// A habit with the dates ticked in one week ('YYYY-MM-DD', ascending).
export type HabitWeek = Habit & { completed_dates: string[] }

// GET /habits?week_start=..., oldest first, each habit with its completed dates in the week that starts on weekStart
// (a Monday). Rejects with ApiError on a non-2xx answer. A habit without completed_dates (an API from before ticking
// existed) is read as having none, so the grid still renders against it.
export async function listHabits(weekStart: string): Promise<HabitWeek[]> {
  const response = await apiFetch(`/habits?week_start=${encodeURIComponent(weekStart)}`)
  if (!response.ok) throw new ApiError(response.status)
  const body = (await response.json()) as { habits: (Habit & { completed_dates?: string[] })[] }
  return body.habits.map((h) => ({ ...h, completed_dates: h.completed_dates ?? [] }))
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

// PUT /habits/:habitId/completions/:date ticks the day; DELETE unticks it. Both are idempotent and send no body. They
// resolve 'saved' on 204. A 404 is not an error to show: the habit was deleted elsewhere (another tab), so they resolve
// 'habit_gone' and the caller refetches to drop the row.
export type CompletionResult = 'saved' | 'habit_gone'

async function completionResult(response: Response): Promise<CompletionResult> {
  if (response.ok) return 'saved'
  if (response.status === 404) return 'habit_gone'
  throw await apiErrorFrom(response)
}

export async function putCompletion(habitId: number, date: string): Promise<CompletionResult> {
  return completionResult(await apiFetch(`/habits/${habitId}/completions/${date}`, { method: 'PUT' }))
}

export async function deleteCompletion(habitId: number, date: string): Promise<CompletionResult> {
  return completionResult(await apiFetch(`/habits/${habitId}/completions/${date}`, { method: 'DELETE' }))
}

// DELETE /habits/:id. Resolves on 204 and also on 404: a habit that is already gone (another tab) is what was wanted.
export async function deleteHabit(id: number): Promise<void> {
  const response = await apiFetch(`/habits/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw await apiErrorFrom(response)
}
