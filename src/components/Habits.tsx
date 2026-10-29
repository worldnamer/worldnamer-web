import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '@/api/client'
import { createHabit, deleteHabit, listHabits, type Habit } from '@/api/habits'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

const inputClass =
  'h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The draft row at the end of the table. Enter commits, Escape cancels, and focus leaving commits the text or, if the
// input is empty, cancels. A 422 shows the API's own message; anything else (5xx, network error) shows a generic one.
// The server decides what a good name is, so the browser only checks for an empty input.
function DraftRow({ onClose }: { onClose: (refocusPlus: boolean) => void }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Set at once (state would lag a render) so that Enter and the blur it causes, or Escape and the unmount, cannot
  // both act on the same draft.
  const busy = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const add = useMutation({
    mutationFn: createHabit,
    onSuccess: (habit) => {
      // Append the new habit to the cached list, so no refetch is needed.
      queryClient.setQueryData<Habit[]>(['habits'], (old) => [...(old ?? []), habit])
      onClose(true)
    },
    onError: (e) => {
      busy.current = false
      const refused = e instanceof ApiError && e.status === 422 && e.serverMessage
      setError(refused || 'Something went wrong. Try again.')
    },
  })

  function commit() {
    if (busy.current) return
    busy.current = true
    setError(null)
    add.mutate(name)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape' && !busy.current) {
      busy.current = true
      onClose(true)
    }
  }

  function handleBlur() {
    if (busy.current) return
    if (name.trim() === '') {
      busy.current = true
      onClose(false)
    } else if (error === null) {
      // After a refusal the text stays as typed; blurring again must not send it again until it is edited.
      commit()
    }
  }

  return (
    <tr>
      <td colSpan={2} className="py-1">
        <div className="grid gap-1">
          <input
            ref={inputRef}
            type="text"
            aria-label="New habit"
            autoComplete="off"
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}

// The logged-in user's habit list. The ['habits'] query is cached by TanStack Query; logout clears the cache.
export function Habits() {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery({
    queryKey: ['habits'],
    queryFn: listHabits,
    retry: false, // a down API should show the error at once, not after several retries
  })
  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)
  // The dialog is controlled: `open` shows it and `target` is the habit it asks about. They are separate so the title
  // keeps its text while the dialog fades out.
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Habit | null>(null)
  const confirmed = useRef(false)
  const opener = useRef<HTMLElement | null>(null) // the row button that opened the dialog
  const [deletingIds, setDeletingIds] = useState<number[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: (habit: Habit) => deleteHabit(habit.id),
    onMutate: (habit) => {
      setDeleteError(null)
      setDeletingIds((ids) => [...ids, habit.id])
    },
    onSuccess: (_result, habit) => {
      queryClient.setQueryData<Habit[]>(['habits'], (old) => old?.filter((h) => h.id !== habit.id))
      // Refetch too, so a 404 (already deleted elsewhere) or a change from another tab shows up.
      void queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
    onError: (_error, habit) => setDeleteError(`Couldn't delete '${habit.name}'. Try again.`),
    onSettled: (_result, _error, habit) => setDeletingIds((ids) => ids.filter((id) => id !== habit.id)),
  })

  // The + button is disabled while the draft is open, so focus can only go back to it after the draft has gone.
  useEffect(() => {
    if (!drafting && refocusPlus.current) {
      refocusPlus.current = false
      plusRef.current?.focus()
    }
  }, [drafting])

  function closeDraft(refocus: boolean) {
    refocusPlus.current = refocus
    setDrafting(false)
  }

  function askToDelete(habit: Habit, button: HTMLElement) {
    confirmed.current = false
    opener.current = button
    setTarget(habit)
    setOpen(true)
  }

  return (
    <section aria-labelledby="habits-heading" className="w-full lg:w-1/2">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h2 id="habits-heading" className="font-display text-xl tracking-wide">
          Habits
        </h2>
        <Button
          ref={plusRef}
          variant="ghost"
          size="icon-sm"
          aria-label="Add habit"
          disabled={drafting}
          onClick={() => setDrafting(true)}
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading habits...</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your habits. Try reloading the page.
          </p>
        )}
        {data && data.length === 0 && !drafting && <p className="text-muted-foreground">No habits yet.</p>}
        {data && (data.length > 0 || drafting) && (
          <table aria-labelledby="habits-heading" className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  Habit
                </th>
                <td />
              </tr>
            </thead>
            <tbody>
              {data.map((habit) => (
                <tr key={habit.id}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {habit.name}
                  </th>
                  <td className="py-1 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Delete ${habit.name}`}
                      disabled={deletingIds.includes(habit.id)}
                      onClick={(event) => askToDelete(habit, event.currentTarget)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {drafting && <DraftRow onClose={closeDraft} />}
            </tbody>
          </table>
        )}
        {deleteError !== null && (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        )}
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          className="border-border bg-panel"
          onCloseAutoFocus={(event) => {
            // Radix only restores focus to a trigger, and this dialog has none, so do it here. After a confirmed delete
            // the row's button is going away, so focus goes to the + button; after Cancel it goes back to the button.
            event.preventDefault()
            if (confirmed.current) plusRef.current?.focus()
            else opener.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl tracking-wide">
              Delete '{target?.name}'?
            </AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                confirmed.current = true
                if (target) remove.mutate(target)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
