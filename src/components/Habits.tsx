import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  deleteCompletion,
  deleteHabit,
  listHabits,
  putCompletion,
  type Habit,
  type HabitWeek,
} from '@/api/habits'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { todayClass } from '@/lib/todayHighlight'
import { cn } from '@/lib/utils'
import {
  addWeeks,
  currentWeekStart,
  formatDayHeader,
  formatDayLabel,
  formatDayShort,
  formatWeekRange,
  today,
  weekDays,
} from '@/lib/week'
import { DraftRow } from '@/components/HabitsDraftRow'

// A box that failed to save: which habit and day, for the message and the cell's outline.
type FailedBox = { habitId: number; name: string; date: string }

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
function DayCell({
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

// The logged-in user's habits as a grid: a row per habit and a column per day of one week, Monday to Sunday. Each
// week is its own ['habits', weekStart] query, cached by TanStack Query; logout clears the cache.
export function Habits() {
  const queryClient = useQueryClient()
  // Today and its week are read from the clock once, when the grid mounts (reading it during render is impure). A tab
  // left open past midnight keeps showing the day it opened on until it is reloaded.
  const [todayIso] = useState(today)
  const [weekStart, setWeekStart] = useState(currentWeekStart)
  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ['habits', weekStart],
    queryFn: () => listHabits(weekStart),
    retry: false, // a down API should show the error at once, not after several retries
    // While another week loads, keep the last week's rows on screen, so the layout does not jump. isPlaceholderData is
    // true meanwhile, and the boxes are disabled, so nothing can be ticked under the wrong dates.
    placeholderData: keepPreviousData,
    // A week fetched in the last minute counts as fresh: going back to it, or tabbing back to the page, sends no
    // request. Our own ticks, adds and deletes still invalidate it. A change from another device shows up within a minute.
    staleTime: 60_000,
  })
  const days = weekDays(weekStart)
  const range = formatWeekRange(weekStart, Number(todayIso.slice(0, 4)))
  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)
  // The dialog is controlled: `open` shows it and `target` is the habit it asks about. They are separate so the title
  // keeps its text while the dialog fades out.
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Habit | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the row button that opened the dialog
  const [deletingIds, setDeletingIds] = useState<number[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // The latest box that failed to save, and its checkbox, for Dismiss to return focus to.
  const [failed, setFailed] = useState<FailedBox | null>(null)
  const failedInput = useRef<HTMLInputElement | null>(null)

  const remove = useMutation({
    mutationFn: (habit: Habit) => deleteHabit(habit.id),
    onMutate: (habit) => {
      setDeleteError(null)
      setDeletingIds((ids) => [...ids, habit.id])
    },
    onSuccess: (_result, habit) => {
      queryClient.setQueriesData<HabitWeek[]>({ queryKey: ['habits'] }, (old) => old?.filter((h) => h.id !== habit.id))
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

  function moveWeek(weeks: number) {
    setFailed(null)
    setWeekStart((start) => addWeeks(start, weeks))
  }

  function recordFailure(box: FailedBox, input: HTMLInputElement | null) {
    failedInput.current = input
    setFailed(box)
  }

  function dismissFailure() {
    setFailed(null)
    // The Dismiss button is about to go, so focus moves to the box that failed, ready to try again.
    failedInput.current?.focus()
  }

  function askToDelete(habit: Habit, button: HTMLElement) {
    opener.current = button
    setTarget(habit)
    setOpen(true)
  }

  return (
    <section aria-labelledby="habits-heading" className="w-full">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="habits-heading" className="font-display text-xl tracking-wide">
          Habits
        </h2>
        <div className="flex items-center gap-2">
          {/* A polite live region, so a screen reader reads the new range after Previous or Next. */}
          <span id="habits-range" aria-live="polite" className="text-sm text-muted-foreground">
            {range}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => moveWeek(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => moveWeek(1)}>
            <ChevronRightIcon />
          </Button>
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
      </div>
      {failed !== null && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p role="alert" className="text-sm text-destructive">
            Couldn't save {failed.name}, {formatDayShort(failed.date)}. Try again.
          </p>
          <Button variant="ghost" size="sm" onClick={dismissFailure}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading habits...</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Couldn't load your habits. Try reloading the page.
          </p>
        )}
        {data && data.length === 0 && !drafting && <p className="text-muted-foreground">No habits yet.</p>}
        {data && (data.length > 0 || drafting) && (
          // Named by the heading and the range, so a screen reader announces "Habits Oct 26 – Nov 1".
          <table
            aria-labelledby="habits-heading habits-range"
            aria-busy={isPlaceholderData}
            className="w-full border-collapse"
          >
            <thead>
              <tr>
                {/* sr-only goes on the text, not the cell: a cell taken out of the layout would shift the columns. */}
                <th scope="col">
                  <span className="sr-only">Habit</span>
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    aria-current={day === todayIso ? 'date' : undefined}
                    className={cn(
                      'w-9 py-1 text-center text-xs font-normal text-muted-foreground',
                      day === todayIso && todayClass,
                    )}
                  >
                    {formatDayHeader(day)}
                  </th>
                ))}
                <td />
              </tr>
            </thead>
            <tbody>
              {data.map((habit) => (
                <tr key={habit.id}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {habit.name}
                  </th>
                  {days.map((day) => (
                    <DayCell
                      key={day}
                      habit={habit}
                      date={day}
                      weekStart={weekStart}
                      isToday={day === todayIso}
                      failed={failed?.habitId === habit.id && failed.date === day}
                      disabled={isPlaceholderData}
                      onToggleStart={() => setFailed(null)}
                      onToggleFail={recordFailure}
                    />
                  ))}
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
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete '${target?.name}'?`}
        onConfirm={() => {
          if (target) remove.mutate(target)
        }}
        // After a confirmed delete the row's button is going away, so focus goes to the + button; after Cancel it goes
        // back to the button that opened the dialog.
        focusAfterClose={(confirmed) => (confirmed ? plusRef.current : opener.current)}
      />
    </section>
  )
}
