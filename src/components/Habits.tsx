import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  deleteHabit,
  listHabits,
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
  formatDayShort,
  formatWeekRange,
  today,
  weekDays,
} from '@/lib/week'
import { DraftRow } from '@/components/HabitsDraftRow'
import { DayCell, type FailedBox } from '@/components/HabitsDayCell'
import { useConfirmDelete } from '@/lib/useConfirmDelete'

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
  // The extracted confirm delete hook
  const del = useConfirmDelete<Habit>(() => plusRef.current)
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
                      onClick={(event) => del.ask(habit, event.currentTarget)}
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
        open={del.open}
        onOpenChange={del.setOpen}
        title={`Delete '${del.target?.name}'?`}
        onConfirm={() => {
          if (del.target) remove.mutate(del.target)
        }}
        // After a confirmed delete the row's button is going away, so focus goes to the + button; after Cancel it goes
        // back to the button that opened the dialog.
        focusAfterClose={del.focusAfterClose}
      />
    </section>
  )
}
