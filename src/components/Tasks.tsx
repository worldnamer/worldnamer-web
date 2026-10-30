import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listTaskLists } from '@/api/taskLists'
import { TaskListRow } from '@/components/TaskListRow'

// The Tasks card: the logged-in user's task lists. One ['task_lists'] query holds them; logout clears the cache.
export function Tasks() {
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

  return (
    <section aria-labelledby="tasks-heading" className="w-full lg:w-1/2">
      {/* min-h-10 matches the Habits heading row, whose icon buttons make it that tall. */}
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="tasks-heading" className="font-display text-xl tracking-wide">
          Tasks
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading lists...</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your lists. Try reloading the page.
          </p>
        )}
        {data && <TaskListRow lists={data} selectedId={selected?.id ?? null} onSelect={setSelectedId} />}
      </div>
    </section>
  )
}
