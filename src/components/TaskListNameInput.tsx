import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

const inputClass =
  'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// A text box for a list's name, used for a new list and for renaming one. Enter saves, and so does focus leaving,
// even with the box empty: a blank name is a valid list. Escape either cancels (when onCancel is given, as for a new
// list) or puts the saved name back.
//
// `onSave` gets the text and whether Enter sent it. It resolves the name as saved (the API strips surrounding spaces),
// which the box then shows, or null if the save failed; the card shows why. After a failure the text stays as typed,
// and focus leaving does not send it again until it is edited; Enter does.
export function TaskListNameInput({
  name,
  onSave,
  onCancel,
  autoFocus = false,
  className,
}: {
  name: string
  onSave: (text: string, viaEnter: boolean) => Promise<string | null>
  onCancel?: () => void
  autoFocus?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(name)
  // Refs rather than state, since state would lag a render: Enter and the blur it can cause, or Escape and the unmount
  // that follows, must not both act on the same text.
  const busy = useRef(false)
  const refused = useRef(false)

  // A new list's box takes focus with its text selected, so typing replaces it.
  useEffect(() => {
    if (!autoFocus) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [autoFocus])

  async function save(viaEnter: boolean) {
    if (busy.current) return
    busy.current = true
    const saved = await onSave(text, viaEnter)
    busy.current = false
    if (saved === null) {
      refused.current = true
    } else {
      setText(saved)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save(true)
    } else if (event.key === 'Escape' && !busy.current) {
      refused.current = false
      if (onCancel) {
        busy.current = true
        onCancel()
      } else {
        setText(name)
      }
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      aria-label="List name"
      autoComplete="off"
      className={cn(inputClass, className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        refused.current = false
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (!refused.current) void save(false)
      }}
    />
  )
}
