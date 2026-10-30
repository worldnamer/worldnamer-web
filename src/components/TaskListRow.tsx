import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TaskList } from '@/api/taskLists'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { accessibleListName, isBlank, rowName } from '@/lib/taskListNames'
import { cn } from '@/lib/utils'

// The list's boxes (its <li> elements), left to right.
function boxesOf(list: HTMLUListElement | null) {
  return Array.from(list?.children ?? []) as HTMLElement[]
}

// The scroll position that shows `box` whole with as much as possible before it: the start of the first box from which
// `box` still fits. Every box start is a snap point, so the row comes to rest there.
function startShowing(boxes: HTMLElement[], box: HTMLElement, width: number) {
  const end = box.offsetLeft + box.offsetWidth
  return boxes.find((b) => b.offsetLeft >= end - width)?.offsetLeft ?? box.offsetLeft
}

// The lists side by side on one line, one box each, in their saved order. Each box is a toggle button; aria-pressed
// marks the selected one. A box has a minimum width, so a blank name is still an empty box to click, and a maximum
// width; the name is cut to a fixed number of characters, with the full name in the native tooltip (title) and the
// accessible name.
//
// When the boxes do not fit, the row scrolls sideways with no visible scrollbar, snapping to whole boxes, by touch or
// trackpad.
//
// The + after the row opens a box at the end of it holding "New List", selected so typing replaces it. `onAdd` saves
// it and resolves the new list, or null if that failed (the card shows why).
export function TaskListRow({
  lists,
  selectedId,
  onSelect,
  onAdd,
}: {
  lists: TaskList[]
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: (name: string) => Promise<TaskList | null>
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)

  // The + is disabled while the draft is open, so focus can only go back to it once the draft has gone.
  useEffect(() => {
    if (!drafting && refocusPlus.current) {
      refocusPlus.current = false
      plusRef.current?.focus()
    }
  }, [drafting])

  // Closes the draft. Focus goes back to the + after Enter or Escape; after a click elsewhere it stays there.
  function closeDraft(refocus: boolean) {
    refocusPlus.current = refocus
    setDrafting(false)
  }

  async function saveDraft(text: string, viaEnter: boolean) {
    const list = await onAdd(text)
    if (list === null) return null
    closeDraft(viaEnter)
    return list.name
  }

  // Bring the selected list into view when the selection changes, including a list that has just been added. Only the
  // row scrolls; the page does not move (scrollIntoView would scroll the page too). It runs on a change of selection
  // only, not on every change to the lists, so it finds the selected box by its aria-pressed.
  useEffect(() => {
    const scroller = scrollerRef.current
    const box = listRef.current?.querySelector('[aria-pressed="true"]')?.closest('li')
    if (!scroller || !box) return
    const { scrollLeft, clientWidth } = scroller
    if (box.offsetLeft < scrollLeft) {
      scroller.scrollLeft = box.offsetLeft
    } else if (box.offsetLeft + box.offsetWidth > scrollLeft + clientWidth) {
      scroller.scrollLeft = startShowing(boxesOf(listRef.current), box, clientWidth)
    }
  }, [selectedId])

  return (
    <div className="flex items-center gap-1">
      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* relative, so each box's offsetLeft is measured from the start of the list. */}
        <ul ref={listRef} aria-label="Task lists" className="relative flex w-max gap-2">
          {lists.map((list) => {
            const selected = list.id === selectedId
            return (
              <li key={list.id} className="shrink-0 snap-start">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={accessibleListName(list.name)}
                  title={isBlank(list.name) ? undefined : list.name}
                  className={cn(
                    'h-8 min-w-16 max-w-56 truncate rounded-md border px-3 text-sm outline-none transition-colors',
                    // An inset ring, so the scroller's edges do not clip it.
                    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
                    selected
                      ? 'border-brand bg-brand/15 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => onSelect(list.id)}
                >
                  {rowName(list.name)}
                </button>
              </li>
            )
          })}
          {drafting && (
            <li className="shrink-0 snap-start">
              <TaskListNameInput
                name="New List"
                autoFocus
                className="w-48 focus-visible:ring-inset"
                onSave={saveDraft}
                onCancel={() => closeDraft(true)}
              />
            </li>
          )}
        </ul>
      </div>
      <Button
        ref={plusRef}
        variant="ghost"
        size="icon-sm"
        aria-label="Add list"
        disabled={drafting}
        onClick={() => setDrafting(true)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
