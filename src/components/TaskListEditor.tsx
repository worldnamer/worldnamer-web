import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TaskList } from '@/api/taskLists'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { TaskListNameInput } from '@/components/TaskListNameInput'
import { Button } from '@/components/ui/button'
import { isBlank } from '@/lib/taskListNames'

// The list's name in quotes for a label, or just "list" when it is blank, so a label never shows empty quotes:
// "Move 'Chores' up", "Move list up".
function quotedName(list: TaskList) {
  return isBlank(list.name) ? 'list' : `'${list.name}'`
}

// One list in the editor: its name box, its up and down arrows, and its delete button, which asks first.
function EditorLine({
  list,
  index,
  count,
  onRename,
  onMove,
  onAskToDelete,
}: {
  list: TaskList
  index: number
  count: number
  onRename: (list: TaskList, text: string) => Promise<string | null>
  onMove: (list: TaskList, by: -1 | 1) => void
  onAskToDelete: (list: TaskList, button: HTMLElement) => void
}) {
  const upRef = useRef<HTMLButtonElement>(null)
  const downRef = useRef<HTMLButtonElement>(null)
  // The arrow just pressed, until the move shows.
  const moved = useRef<'up' | 'down' | null>(null)

  // Once the list has moved, focus goes back to the arrow that moved it, which React may have taken out of the page
  // and put back while reordering. If that arrow is now disabled (the list reached the top or bottom), focus goes to
  // the other arrow instead.
  useEffect(() => {
    const direction = moved.current
    if (direction === null) return
    moved.current = null
    const same = direction === 'up' ? upRef.current : downRef.current
    const other = direction === 'up' ? downRef.current : upRef.current
    if (same && !same.disabled) {
      same.focus()
    } else {
      other?.focus()
    }
  }, [index])

  function move(direction: 'up' | 'down') {
    moved.current = direction
    onMove(list, direction === 'up' ? -1 : 1)
  }

  return (
    <li className="flex items-center gap-1">
      <TaskListNameInput name={list.name} className="min-w-0 flex-1" onSave={(text) => onRename(list, text)} />
      <Button
        ref={upRef}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${quotedName(list)} up`}
        disabled={index === 0}
        onClick={() => move('up')}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        ref={downRef}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${quotedName(list)} down`}
        disabled={index === count - 1}
        onClick={() => move('down')}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground"
        aria-label={isBlank(list.name) ? 'Delete list' : `Delete ${list.name}`}
        onClick={(event) => onAskToDelete(list, event.currentTarget)}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

// The editor that replaces the row: one line per list, in order, and a Confirm Lists button that goes back to the
// row. Every change saves as it is made (a name on Enter or when focus leaves its box, an order on each arrow press),
// so Confirm Lists saves nothing itself; pressing it moves focus off a name box, which saves that box. `onRename`
// resolves the name as saved, or null. A delete is confirmed in the shared dialog before `onDelete` is called.
//
// The + opens a box at the end of the editor holding "New List", selected so typing replaces it, and saved like a
// name (Enter or focus leaving, including by pressing Confirm Lists). `onAdd` resolves the new list, or null.
export function TaskListEditor({
  lists,
  onRename,
  onMove,
  onDelete,
  onAdd,
  onConfirm,
}: {
  lists: TaskList[]
  onRename: (list: TaskList, text: string) => Promise<string | null>
  onMove: (list: TaskList, by: -1 | 1) => void
  onDelete: (list: TaskList) => void
  onAdd: (name: string) => Promise<TaskList | null>
  onConfirm: () => void
}) {
  const groupRef = useRef<HTMLDivElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)
  // The dialog is controlled: `open` shows it and `target` is the list it asks about. They are separate so the title
  // keeps its text while the dialog fades out.
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<TaskList | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the delete button that opened the dialog

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

  function askToDelete(list: TaskList, button: HTMLElement) {
    opener.current = button
    setTarget(list)
    setOpen(true)
  }

  // The edit button that opened the editor has gone, so focus moves to the editor itself. Not to the first name box,
  // which on a phone would open the on-screen keyboard.
  useEffect(() => {
    groupRef.current?.focus()
  }, [])

  return (
    <div ref={groupRef} role="group" aria-label="Edit lists" tabIndex={-1} className="grid gap-2 outline-none">
      <ul aria-label="Task lists" className="grid gap-1">
        {lists.map((list, index) => (
          <EditorLine
            key={list.id}
            list={list}
            index={index}
            count={lists.length}
            onRename={onRename}
            onMove={onMove}
            onAskToDelete={askToDelete}
          />
        ))}
        {drafting && (
          <li className="flex items-center gap-1">
            <TaskListNameInput
              name="New List"
              autoFocus
              className="min-w-0 flex-1"
              onSave={saveDraft}
              onCancel={() => closeDraft(true)}
            />
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-2">
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
        <Button variant="outline" size="sm" onClick={onConfirm}>
          Confirm Lists
        </Button>
      </div>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={target && !isBlank(target.name) ? `Delete '${target.name}'?` : 'Delete this list?'}
        onConfirm={() => {
          if (target) onDelete(target)
        }}
        // After a confirmed delete the list's own button is going away, so focus goes to the +; after Cancel it goes
        // back to the button that opened the dialog.
        focusAfterClose={(confirmed) => (confirmed ? plusRef.current : opener.current)}
      />
    </div>
  )
}
