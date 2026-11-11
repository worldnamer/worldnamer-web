import { useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query'
import {
  deleteCompletion,
  putCompletion,
  type HabitWeek,
} from '@/api/habits'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  formatDayLabel,
} from '@/lib/week'
import { todayClass } from '@/lib/todayHighlight'
import { type FailedBox } from '@/lib/useFailedTick'

// Ticks or unticks one day in one cached week, leaving every other cell alone.
function setTicked(queryClient: QueryClient, weekStart: string, habitId: number, date: string, ticked: boolean) {
  queryClient.setQueryData<HabitWeek[]>(['habits', weekStart], (old) =>
    old?.map((h) => {
      if (h.id !== habitId) return h
      const others = h.completed_dates.filter((d) => d !== date)
      return { ...h, completed_dates: ticked ? [...others, date].sort() : others }
    }),
  )
}

// One day of one habit: a native checkbox that saves as soon as it changes. The change shows at once (optimistic)
// and is put back if the request fails.
export function DayCell({
  habit,
  date,
  weekStart,
  isToday,
  failed,
  disabled,
  onToggleStart,
  onToggleFail,
}: {
  habit: HabitWeek
  date: string
  weekStart: string
  isToday: boolean
  failed: boolean
  disabled: boolean
  onToggleStart: () => void
  onToggleFail: (box: FailedBox, input: HTMLInputElement | null) => void
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const ticked = habit.completed_dates.includes(date)

  const toggle = useMutation({
    mutationKey: ['completion'],
    // Mutations with the same scope run one after another, in order, so quick clicks on this box reach the server in
    // the order they were made; other boxes still save in parallel. A queued click still runs onMutate at once.
    scope: { id: `${habit.id}:${date}` },
    mutationFn: (tick: boolean) => (tick ? putCompletion(habit.id, date) : deleteCompletion(habit.id, date)),
    onMutate: async (tick) => {
      // Cancel a week fetch in flight first, so its older answer cannot overwrite the change shown below.
      await queryClient.cancelQueries({ queryKey: ['habits', weekStart] })
      const week = queryClient.getQueryData<HabitWeek[]>(['habits', weekStart])
      const wasTicked = week?.find((h) => h.id === habit.id)?.completed_dates.includes(date) ?? !tick
      setTicked(queryClient, weekStart, habit.id, date, tick)
      return { wasTicked }
    },
    onError: (_error, tick, context) => {
      // Put the box back at once, without waiting for the refetch.
      setTicked(queryClient, weekStart, habit.id, date, context?.wasTicked ?? !tick)
      onToggleFail({ habitId: habit.id, name: habit.name, date }, inputRef.current)
    },
    onSettled: (result, error) => {
      // A 204 means the server did what the click asked, so the optimistic state is already right and nothing is
      // refetched. After a failure the request may or may not have landed, and after a 404 the habit is gone, so once
      // the last toggle in flight settles (this one still counts) the week is refetched once to show the server's state.
      if ((error || result === 'habit_gone') && queryClient.isMutating({ mutationKey: ['completion'] }) === 1) {
        void queryClient.invalidateQueries({ queryKey: ['habits', weekStart] })
      }
    },
  })

  return (
    <td
      className={cn(
        'py-1 text-center',
        isToday && todayClass,
        failed && 'outline-2 -outline-offset-2 outline-destructive',
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        aria-label={`${habit.name}, ${formatDayLabel(date)}`}
        className="size-4 cursor-pointer align-middle accent-brand disabled:cursor-default"
        checked={ticked}
        disabled={disabled}
        onChange={() => {
          onToggleStart()
          toggle.mutate(!ticked)
        }}
      />
    </td>
  )
}
