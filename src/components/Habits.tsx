import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { createHabit, listHabits, type Habit } from '@/api/habits'
import { Button } from '@/components/ui/button'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The add form. A 422 shows the API's own message; anything else (5xx, network error) shows a generic one.
function AddHabitForm() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
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
  const { data, isPending, isError } = useQuery({
    queryKey: ['habits'],
    queryFn: listHabits,
    retry: false, // a down API should show the error at once, not after several retries
  })

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
            <li key={habit.id}>{habit.name}</li>
          ))}
        </ul>
      )}
      <AddHabitForm />
    </section>
  )
}
