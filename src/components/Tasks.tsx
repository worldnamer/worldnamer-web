import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { createTaskList, listTaskLists, type TaskList } from '@/api/taskLists'
import { TaskListEditor } from '@/components/TaskListEditor'
import { TaskListRow } from '@/components/TaskListRow'
import { Button } from '@/components/ui/button'

// The API's own message for a refused name (422), if it sent one.
function refusal(error: Error) {
  return error instanceof ApiError && error.status === 422 ? error.serverMessage : undefined
}

// The Tasks card: the logged-in user's task lists. One ['task_lists'] query holds them; logout clears the cache. The
// mutations live here, with their cache updates and error reporting in the useMutation options rather than in each
// call, so they still run if the box that started the save has gone (the view changed while it was in flight).
export function Tasks() {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery({
    queryKey: ['task_lists'],
    queryFn: listTaskLists,
    retry: false, // a down API should show the error at once, not after several retries
    // Lists fetched in the last minute count as fresh, so tabbing back to the page sends no request. Our own changes
    // write the cache directly.
    staleTime: 60_000,
  })
  // Only the id is kept. The selected list is worked out from it on every render, falling back to the first list, so
  // the first list is selected on load, and again when the selected one is deleted here or in another tab.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = data?.find((l) => l.id === selectedId) ?? data?.[0]
  // The card's one error line for a failed save. It is cleared when the next save starts.
  const [error, setError] = useState<string | null>(null)
  // The row, or the editor in its place. Both read the same query, so switching sends no request.
  const [mode, setMode] = useState<'row' | 'editor'>('row')
  const editRef = useRef<HTMLButtonElement>(null)
  const refocusEdit = useRef(false)

  // Confirm Lists goes away with the editor, so focus goes back to the edit button that opened it.
  useEffect(() => {
    if (mode === 'row' && refocusEdit.current) {
      refocusEdit.current = false
      editRef.current?.focus()
    }
  }, [mode])

  function closeEditor() {
    refocusEdit.current = true
    setMode('row')
  }

  const create = useMutation({
    mutationFn: createTaskList,
    onMutate: () => setError(null),
    onSuccess: (list) => {
      queryClient.setQueryData<TaskList[]>(['task_lists'], (old) => (old ? [...old, list] : old))
      setSelectedId(list.id) // a new list becomes the selected one
    },
    onError: (e) => setError(refusal(e) || "Couldn't add the list. Try again."),
  })

  // Resolves the new list, or null if it was not saved (the error line says why).
  const addList = (name: string) => create.mutateAsync(name).catch(() => null)

  return (
    <section aria-labelledby="tasks-heading" className="w-full lg:w-1/2">
      {/* min-h-10 matches the Habits heading row, whose icon buttons make it that tall. */}
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="tasks-heading" className="font-display text-xl tracking-wide">
          Tasks
        </h2>
        {mode === 'row' && (
          <Button
            ref={editRef}
            variant="ghost"
            size="icon-sm"
            aria-label="Edit lists"
            disabled={!data}
            onClick={() => setMode('editor')}
          >
            <PencilIcon />
          </Button>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="pt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading lists...</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your lists. Try reloading the page.
          </p>
        )}
        {data && mode === 'row' && (
          <TaskListRow lists={data} selectedId={selected?.id ?? null} onSelect={setSelectedId} onAdd={addList} />
        )}
        {data && mode === 'editor' && <TaskListEditor lists={data} onConfirm={closeEditor} />}
      </div>
    </section>
  )
}
