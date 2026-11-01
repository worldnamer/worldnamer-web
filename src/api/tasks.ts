import { apiErrorFrom, apiFetch } from './client'

// One task in a list. Text may be blank ("") or repeated, so a task is told apart by its id.
export type Task = { id: number; text: string; done: boolean }

// GET /task_lists/:listId/tasks: the list's tasks, oldest first. Rejects with an ApiError on a non-2xx answer; a 404
// means the list is not one of the user's (or no longer exists).
export async function listTasks(listId: number): Promise<Task[]> {
  const response = await apiFetch(`/task_lists/${listId}/tasks`)
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { tasks: Task[] }
  return body.tasks
}

// POST /task_lists/:listId/tasks. Resolves the created task, unchecked, which the API puts last; the text comes back
// with surrounding spaces stripped, and blank text is allowed. Rejects with an ApiError otherwise: a 422 says what is
// wrong with the text, and a 404 means the list is gone (deleted elsewhere).
export async function createTask(listId: number, text: string): Promise<Task> {
  const response = await apiFetch(`/task_lists/${listId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { text } }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task: Task }
  return body.task
}

// The fields of a task that PATCH can change. Send only the ones being changed: the others stay as they are on the
// server, so an edit and a check in flight together cannot undo each other.
export type TaskChanges = { text?: string; done?: boolean }

// PATCH /task_lists/:listId/tasks/:id. Resolves the task as saved (text with surrounding spaces stripped). Rejects with
// an ApiError otherwise: a 422 says what is wrong with the text, and a 404 means the task or its list is gone.
export async function updateTask(listId: number, id: number, changes: TaskChanges): Promise<Task> {
  const response = await apiFetch(`/task_lists/${listId}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: changes }),
  })
  if (!response.ok) throw await apiErrorFrom(response)
  const body = (await response.json()) as { task: Task }
  return body.task
}
