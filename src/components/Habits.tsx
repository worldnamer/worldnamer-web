import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent, type RefObject } from 'react'
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
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The add form. A 422 shows the API's own message; anything else (5xx, network error) shows a generic one.
function AddHabitForm({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: createHabit,
    onSuccess: (habit) => {
      // Append the new habit to the cached list, so no refetch is needed.
      queryClient.setQueryData<Habit[]>(['habits'], (old) => [...(old ?? []), habit])
      setName('')
      inputRef.current?.focus() // the submit button was clicked, so put the cursor back for the next habit
    },
    onError: (e) => {
      const refused = e instanceof ApiError && e.status === 422 && e.serverMessage
      setError(refused || 'Something went wrong. Try again.')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (add.isPending) return
    setError(null)
    add.mutate(name)
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-1.5">
      <label htmlFor="new-habit" className="text-sm text-muted-foreground">
        New habit
      </label>
      <div className="flex gap-2">
        <input
          id="new-habit"
          ref={inputRef}
          type="text"
          autoComplete="off"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={add.isPending}>
          Add
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
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
  const inputRef = useRef<HTMLInputElement>(null)
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

  function askToDelete(habit: Habit, button: HTMLElement) {
    confirmed.current = false
    opener.current = button
    setTarget(habit)
    setOpen(true)
  }

  return (
    <section aria-labelledby="habits-heading" className="grid gap-3">
      <h2 id="habits-heading" className="font-display text-xl tracking-wide">
        Habits
      </h2>
      {isPending && <p className="text-muted-foreground">Loading habits...</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          Couldn't load your habits. Try reloading the page.
        </p>
      )}
      {data && data.length === 0 && <p className="text-muted-foreground">No habits yet.</p>}
      {data && data.length > 0 && (
        // role="list" because Tailwind removes the bullets, and Safari VoiceOver then stops announcing a list.
        <ul role="list" className="grid gap-2">
          {data.map((habit) => (
            <li key={habit.id} className="flex items-center justify-between gap-3">
              <span>{habit.name}</span>
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
            </li>
          ))}
        </ul>
      )}
      {deleteError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
      <AddHabitForm inputRef={inputRef} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          className="border-border bg-panel"
          onCloseAutoFocus={(event) => {
            // Radix only restores focus to a trigger, and this dialog has none, so do it here. After a confirmed delete
            // the row's button is going away, so focus goes to the add field; after Cancel it goes back to the button.
            event.preventDefault()
            if (confirmed.current) inputRef.current?.focus()
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
