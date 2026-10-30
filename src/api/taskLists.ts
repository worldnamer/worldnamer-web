import { apiErrorFrom, apiFetch } from './client'

// A named list. Names may be blank ("") or repeated, so a list is told apart by its id.
export type TaskList = { id: number; name: string }

// GET /task_lists: the logged-in user's lists in their saved order. Rejects with ApiError on a non-2xx answer.
export async function listTaskLists(): Promise<TaskList[]> {
  const response = await apiFetch('/task_lists')
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task_lists: TaskList[] }
  return body.task_lists
}
