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

// POST /task_lists. Resolves the created list, which the API puts last; the name comes back with surrounding spaces
// stripped, and a blank name is allowed. A 422 rejects with an ApiError whose serverMessage says what is wrong.
export async function createTaskList(name: string): Promise<TaskList> {
  const response = await apiFetch('/task_lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_list: { name } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task_list: TaskList }
  return body.task_list
}
