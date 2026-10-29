import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '@/api/client'
import {
  createHabit,
  deleteCompletion,
  deleteHabit,
  listHabits,
  putCompletion,
  type Habit,
  type HabitWeek,
} from '@/api/habits'
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

// The habit name, seven days and the Delete button.
const columnCount = 9

// A subtle background on today's column, from the theme's muted surface colour.
const todayClass = 'bg-accent/40'

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
      // Append the new habit, with nothing ticked, to every cached week, so no refetch is needed.
      queryClient.setQueriesData<HabitWeek[]>({ queryKey: ['habits'] }, (old) =>
        old ? [...old, { ...habit, completed_dates: [] }] : old,
      )
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
      <td colSpan={columnCount} className="py-1">
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
    onSettled: () => {
      // Refetch the week once the last toggle in flight settles (this one still counts), so a burst of clicks ends in
      // one request that brings in the server's state.
      if (queryClient.isMutating({ mutationKey: ['completion'] }) === 1) {
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
  const confirmed = useRef(false)
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
    confirmed.current = false
    opener.current = button
    setTarget(habit)
    setOpen(true)
  }

  return (
    <section aria-labelledby="habits-heading" className="w-full lg:w-1/2">
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
