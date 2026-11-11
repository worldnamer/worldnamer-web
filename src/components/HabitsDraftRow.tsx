import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '@/api/client'
import { createHabit, type HabitWeek } from '@/api/habits'

// The habit name, seven days and the Delete button.
const columnCount = 9

const inputClass =
  'h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The draft row at the end of the table. Enter commits, Escape cancels, and focus leaving commits the text or, if the
// input is empty, cancels. A 422 shows the API's own message; anything else (5xx, network error) shows a generic one.
// The server decides what a good name is, so the browser only checks for an empty input.
export function DraftRow({ onClose }: { onClose: (refocusPlus: boolean) => void }) {
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