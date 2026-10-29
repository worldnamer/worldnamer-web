import { useQuery } from '@tanstack/react-query'
import { listHabits } from '@/api/habits'

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
    </section>
  )
}
