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

// PATCH /task_lists/:id renames a list. Resolves the list as saved (surrounding spaces stripped). Rejects with an
// ApiError otherwise: a 422 says what is wrong with the name, and a 404 means the list is gone (deleted elsewhere).
export async function renameTaskList(id: number, name: string): Promise<TaskList> {
  const response = await apiFetch(`/task_lists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_list: { name } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task_list: TaskList }
  return body.task_list
}

// PUT /task_list_order saves the order of all the user's lists, given as their ids, first to last. Resolves the lists
// in the new order. Rejects with an ApiError otherwise; a 409 means the ids are not exactly the user's lists (one was
// added or deleted elsewhere), and nothing was changed.
export async function reorderTaskLists(ids: number[]): Promise<TaskList[]> {
  const response = await apiFetch('/task_list_order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task_lists: TaskList[] }
  return body.task_lists
}

// DELETE /task_lists/:id. Resolves on 204 and also on 404: a list that is already gone (deleted in another tab) is
// what was wanted.
export async function deleteTaskList(id: number): Promise<void> {
  const response = await apiFetch(`/task_lists/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw await apiErrorFrom(response)
}
