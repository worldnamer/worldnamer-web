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
