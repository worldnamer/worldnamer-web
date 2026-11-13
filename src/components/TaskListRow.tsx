import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { TaskList } from '@/api/taskLists'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { accessibleListName, isBlank, rowName } from '@/lib/taskListNames'
import { cn } from '@/lib/utils'
import { useDraft } from '@/lib/useDraft'

// The list's boxes (its <li> elements), left to right.
function boxesOf(list: HTMLUListElement | null) {
  return Array.from(list?.children ?? []) as HTMLElement[]
}

// The scroll position that shows `box` whole with as much as possible before it: the start of the first box from which
// `box` still fits.
function startShowing(boxes: HTMLElement[], box: HTMLElement, width: number) {
  const end = box.offsetLeft + box.offsetWidth
  return boxes.find((b) => b.offsetLeft >= end - width)?.offsetLeft ?? box.offsetLeft
}

// True when the row has more lists past its right edge than are visible.
function hasMoreRight(scroller: HTMLElement) {
  return scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth
}

// The lists side by side on one line, one box each, in their saved order. Each box is a toggle button; aria-pressed
// marks the selected one. A box has a minimum width, so a blank name is still an empty box to click, and a maximum
// width; the name is cut to a fixed number of characters, with the full name in the native tooltip (title) and the
// accessible name.
//
// When the boxes do not fit, the row scrolls sideways with no visible scrollbar, by touch, by trackpad, or by dragging
// with the mouse.
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
  const { drafting, setDrafting, closeDraft, plusRef } = useDraft()
  // Whether a fade shows at the left edge, because the row has been scrolled away from its start.
  const [scrolledAway, setScrolledAway] = useState(false)
  // Whether a fade shows at the right edge, because more lists lie past it.
  const [moreRight, setMoreRight] = useState(false)

  // Sets both fades from the scroller's position.
  function updateFades(scroller: HTMLElement) {
    setScrolledAway(scroller.scrollLeft > 0)
    setMoreRight(hasMoreRight(scroller))
  }

  // The fades are measured when the lists change, then again on every scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller) updateFades(scroller)
  }, [lists])

  // A resize changes how many lists fit, so the fades are measured again when the window is resized.
  useEffect(() => {
    function onResize() {
      const scroller = scrollerRef.current
      if (scroller) updateFades(scroller)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  // Set when a press became a drag. The click that the browser fires on release would select a list, so the next click
  // on the row is swallowed instead. Any new press clears it.
  const swallowClick = useRef(false)

  // The press that may become a drag: the pointer, where it went down, and the row's position then. captured is set
  // once the pointer has moved far enough to count as a drag and has been captured by the row.
  const press = useRef<{ pointerId: number; startX: number; startScrollLeft: number; captured: boolean } | null>(null)

  // Touch and pen already scroll the row natively, so only a primary mouse press starts a drag here.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    swallowClick.current = false
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    press.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      captured: false,
    }
  }

  // A small movement is a click, not a drag, so the row only starts to follow the pointer past a few pixels.
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = press.current
    if (!current) return
    const scroller = event.currentTarget
    const moved = event.clientX - current.startX
    if (!current.captured) {
      if (Math.abs(moved) <= 5) return
      scroller.setPointerCapture(current.pointerId)
      current.captured = true
      swallowClick.current = true
    }
    scroller.scrollLeft = current.startScrollLeft - moved
  }

  // Ends the press on release or cancel, letting go of the pointer if the row had captured it.
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const current = press.current
    press.current = null
    if (current?.captured) event.currentTarget.releasePointerCapture(current.pointerId)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          className="cursor-grab overflow-x-auto active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => updateFades(event.currentTarget)}
          onClickCapture={(event) => {
            if (!swallowClick.current) return
            swallowClick.current = false
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {/* relative, so each box's offsetLeft is measured from the start of the list. */}
          <ul ref={listRef} aria-label="Task lists" className="relative flex w-max gap-2">
            {lists.map((list) => {
              const selected = list.id === selectedId
              return (
                <li key={list.id} className="shrink-0">
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
              <li className="shrink-0">
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
        {scrolledAway && (
          <div
            data-fade="start"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent"
          />
        )}
        {moreRight && (
          <div
            data-fade="end"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
          />
        )}
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
