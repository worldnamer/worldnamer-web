import { useQuery } from '@tanstack/react-query'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { getRecipe, type Recipe, type RecipeIngredient } from '@/api/recipes'
import { formatMinutes } from '@/lib/duration'
import { forgetLastRecipe, setLastRecipe } from '@/lib/lastRecipe'
import { Button } from '@/components/ui/button'
import { useRecipeSaver } from '@/lib/useRecipeSaver'
import { cn } from '@/lib/utils'

// The recipe named in the address (/recipes/:id). With no id it is a prompt, shown only from lg since below that the
// rolodex is all there is. A 404 (not the user's recipe, or gone) goes back to /recipes without a message. Every
// piece of recipe text is shown as a text node or as the value of a box, never as HTML. The card is formatted text; one
// field at a time turns into a box while it is edited. Keyed by id so a card's drafts and messages never carry over to
// another recipe.
export function RecipeCard() {
  const { id } = useParams()
  if (id === undefined) return <p className="hidden text-sm text-muted-foreground lg:block">Pick a recipe or add one</p>
  return <SelectedRecipe key={id} id={id} />
}

function SelectedRecipe({ id }: { id: string }) {
  // retry: false so a 404 redirects at once, and a down API shows the failure line at once. The short staleTime keeps
  // the card from refetching on mount right after Add recipe filled this entry from the create answer.
  const { data, error, isPending } = useQuery({
    queryKey: ['recipes', id],
    queryFn: () => getRecipe(id),
    retry: false,
    staleTime: 10_000,
  })

  // Remember the recipe once it has opened, so /recipes can come back to it.
  const opened = data !== undefined
  useEffect(() => {
    if (opened) setLastRecipe(id)
  }, [opened, id])
  // A recipe the API does not have must not be reopened from /recipes, even while the list still names it.
  const gone = error instanceof ApiError && error.status === 404
  useEffect(() => {
    if (gone) forgetLastRecipe(id)
  }, [gone, id])

  if (error instanceof ApiError && error.status === 404) return <Navigate to="/recipes" replace />
  if (isPending) return null
  if (error) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Could not load the recipe.
      </p>
    )
  }
  return <Card recipe={data} />
}

// An area of the card: a heading with a rule under it, and, for Prep and Cook, the minutes box on the heading line,
// right-aligned.
function Area({ title, headingExtra, children }: { title: string; headingExtra?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between border-b border-border pb-1">
        <h3 className="font-bold">{title}</h3>
        {headingExtra}
      </div>
      <div className="pt-2">{children}</div>
    </div>
  )
}

// A visible box with a placeholder, so an empty field reads as a place to type.
const boxClass =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function Messages({ messages }: { messages: string[] | undefined }) {
  if (!messages || messages.length === 0) return null
  return (
    <div role="alert" className="pt-1 text-sm text-destructive">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

type TextKey = 'title' | 'prep_instructions' | 'cook_instructions'
type MinutesKey = 'prep_minutes' | 'cook_minutes'
type DraftKey = TextKey | MinutesKey

// The limits the API enforces, so a box stops typing at them. The API still checks every value.
const MAX_TITLE = 100
const MAX_INSTRUCTIONS = 10_000
const MAX_MINUTES_DIGITS = 5
const MAX_INGREDIENT_NAME = 50
const MAX_INGREDIENT_AMOUNT = 49

// An ingredient row being edited. The key belongs to the row on screen, not to its place in the list, so a row keeps its
// input (and the focus in it) when another row is dropped above it. Saved rows are keyed s0, s1... and rows typed in
// here n1, n2...
type Row = { key: string; name: string; amount: string }

const isBlank = (row: Row) => row.name.trim() === '' && row.amount.trim() === ''

// What is sent for rows: blank rows left out, text stripped.
function payloadOf(rows: Row[]): RecipeIngredient[] {
  return rows.filter((row) => !isBlank(row)).map((row) => ({ name: row.name.trim(), amount: row.amount.trim() }))
}

const sameIngredients = (a: RecipeIngredient[], b: RecipeIngredient[]) => JSON.stringify(a) === JSON.stringify(b)

// The text of a minutes box for a saved value: the number, or empty for none.
function minutesText(minutes: number | null): string {
  return minutes === null ? '' : String(minutes)
}

// What to send for a minutes box: empty means none (null), digits are a number, and anything else goes as typed, so the
// API stays the one to reject it. A number-type box is avoided because the browser turns garbage into "", which would
// silently clear a time.
function minutesValue(text: string): number | string | null {
  if (text === '') return null
  return /^\d+$/.test(text) ? Number(text) : text
}

// Puts the cursor in a box as it appears, with its text selected. A stable function, so React calls it only on mount.
function focusAndSelect(element: HTMLInputElement | null) {
  element?.focus()
  element?.select()
}

// The same for a textarea, with the cursor at the end so a long text is not selected by accident.
function focusAtEnd(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
}

// The look of a field at rest: plain text that is a button, with a faint underline on hover and focus as the cue that it
// can be edited.
const triggerClass =
  'cursor-text rounded-sm text-left outline-none hover:underline hover:decoration-muted-foreground/60 hover:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50'

function MinutesBox({
  label,
  value,
  onChange,
  onBlur,
  onKeyDown,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <span className="flex items-baseline gap-1 text-sm text-muted-foreground">
      <input
        ref={focusAndSelect}
        type="text"
        inputMode="numeric"
        aria-label={label}
        placeholder="min"
        autoComplete="off"
        maxLength={MAX_MINUTES_DIGITS}
        className={cn(boxClass, 'w-16 text-right')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      min
    </span>
  )
}

type Box = {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}

// An instructions field: the saved text with its line breaks (or a muted prompt) as a button, or the textarea while it is
// being edited.
function InstructionsField({
  editing,
  box,
  text,
  prompt,
  label,
  triggerRef,
  onOpen,
}: {
  editing: boolean
  box: Box
  text: string
  prompt: string
  label: string
  triggerRef: (element: HTMLButtonElement | null) => void
  onOpen: () => void
}) {
  if (editing) {
    return (
      <textarea
        ref={focusAtEnd}
        aria-label={label}
        placeholder={label}
        rows={4}
        maxLength={MAX_INSTRUCTIONS}
        className={boxClass}
        value={box.value}
        onChange={(e) => box.onChange(e.target.value)}
        onBlur={box.onBlur}
        onKeyDown={box.onKeyDown}
      />
    )
  }
  return (
    <button type="button" ref={triggerRef} title={`Edit ${label.toLowerCase()}`} className={cn(triggerClass, 'block w-full')} onClick={onOpen}>
      {text === '' ? (
        <span className="text-sm text-muted-foreground">{prompt}</span>
      ) : (
        <span className="block whitespace-pre-line">{text}</span>
      )}
    </button>
  )
}

// The time on a heading line: "1 hr 20 min" or a muted prompt as a button, or the number box while it is edited.
function MinutesField({
  editing,
  box,
  minutes,
  prompt,
  label,
  triggerRef,
  onOpen,
}: {
  editing: boolean
  box: Box
  minutes: number | null
  prompt: string
  label: string
  triggerRef: (element: HTMLButtonElement | null) => void
  onOpen: () => void
}) {
  if (editing) {
    return <MinutesBox label={label} value={box.value} onChange={box.onChange} onBlur={box.onBlur} onKeyDown={box.onKeyDown} />
  }
  return (
    <button type="button" ref={triggerRef} title={`Edit ${label.toLowerCase()}`} className={cn(triggerClass, 'text-sm text-muted-foreground')} onClick={onOpen}>
      {minutes === null ? prompt : formatMinutes(minutes)}
    </button>
  )
}

// The card. Every field is formatted text until it is clicked or reached by keyboard and activated, when that one field
// becomes a box. Each box shows its draft, the text being typed, or else the saved value from the cache; only a field
// being edited has a draft, so every other field follows the cache the moment a save lands. Leaving a box saves it:
// nothing is sent when the text equals what is saved, and a blank title goes back to the saved one. Enter in a one-line
// box does the same and returns focus to the text, and Escape drops the draft without saving. The box closes when the
// save succeeds (if it still holds what was sent) or the API rejects it, and the card then shows what was last saved.
// When the save fails some other way the box stays open with what was typed, and the next blur or Enter retries.
function Card({ recipe }: { recipe: Recipe }) {
  const { save, errors, clearError } = useRecipeSaver(String(recipe.id))
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({})
  const draftsRef = useRef<Partial<Record<DraftKey, string>>>({}) // what a save's callback must see, not a render's copy
  const [editing, setEditing] = useState<Partial<Record<DraftKey, boolean>>>({})
  // The buttons that show closed fields, by field key, 'row:<key>' for an ingredient row and 'plus' for the add button.
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  // Which of them gets focus back once its box has closed after Enter or Escape. Opening any box clears it.
  const [refocus, setRefocus] = useState<string | null>(null)
  // The ingredient row whose two boxes are open, and the row that is a new one still being added (it has no saved
  // counterpart, and the + button is replaced by it).
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [addingRow, setAddingRow] = useState<string | null>(null)

  useEffect(() => {
    if (refocus === null) return
    const isRowTarget = refocus === 'plus' || refocus.startsWith('row:')
    const closed = isRowTarget ? openRow === null : !editing[refocus as DraftKey]
    if (closed) triggers.current[refocus]?.focus()
  }, [refocus, editing, openRow])

  function setDraft(key: DraftKey, value: string | undefined) {
    const next = { ...draftsRef.current }
    if (value === undefined) delete next[key]
    else next[key] = value
    draftsRef.current = next
    setDrafts(next)
  }

  function setOpen(key: DraftKey, open: boolean) {
    setEditing((current) => {
      const next = { ...current }
      if (open) next[key] = true
      else delete next[key]
      return next
    })
  }

  function savedText(key: DraftKey): string {
    return key === 'prep_minutes' || key === 'cook_minutes' ? minutesText(recipe[key]) : recipe[key]
  }

  function openBox(key: DraftKey) {
    setRefocus(null)
    setDraft(key, savedText(key))
    setOpen(key, true)
  }

  // The text of a closed field is a button; the card remembers it so focus can go back to it.
  function trigger(key: string) {
    return (element: HTMLButtonElement | null) => {
      triggers.current[key] = element
    }
  }

  function finish(key: DraftKey, viaKey: boolean) {
    const close = () => {
      if (viaKey) setRefocus(key)
      setOpen(key, false)
    }
    const draft = draftsRef.current[key]
    if (draft === undefined) {
      close()
      return
    }
    const text = draft.trim()
    if (text === savedText(key) || (key === 'title' && text === '')) {
      setDraft(key, undefined)
      close()
      return
    }
    save({
      key,
      patch: { [key]: key === 'prep_minutes' || key === 'cook_minutes' ? minutesValue(text) : text },
      onSaved: () => {
        if (draftsRef.current[key] === draft) {
          setDraft(key, undefined)
          close()
        }
      },
      onRejected: () => {
        setDraft(key, undefined)
        close()
      },
    })
  }

  function cancel(key: DraftKey) {
    setDraft(key, undefined)
    clearError(key, null)
    setRefocus(key)
    setOpen(key, false)
  }

  function textBox(key: DraftKey, multiline = false) {
    return {
      value: drafts[key] ?? savedText(key),
      onChange: (value: string) => {
        clearError(key, null)
        setDraft(key, value)
      },
      onBlur: () => finish(key, false),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel(key)
        } else if (event.key === 'Enter' && !multiline) {
          event.preventDefault()
          finish(key, true)
        }
      },
    }
  }

  const title = textBox('title')
  const prep = textBox('prep_instructions', true)
  const cook = textBox('cook_instructions', true)
  const prepMinutes = textBox('prep_minutes')
  const cookMinutes = textBox('cook_minutes')

  // Ingredient rows. A draft, when there is one, is the whole list of rows being edited. After a save the saved rows keep
  // the keys the draft rows had (savedKeys), so a row does not remount, and lose focus, when the cache takes over again.
  const [ingredientDraft, setIngredientDraft] = useState<Row[] | undefined>(undefined)
  const ingredientRef = useRef<Row[] | undefined>(undefined)
  const [savedKeys, setSavedKeys] = useState<string[] | null>(null)
  const [nextNew, setNextNew] = useState(1)

  function setIngredients(rows: Row[] | undefined) {
    ingredientRef.current = rows
    setIngredientDraft(rows)
  }

  const savedRows: Row[] = recipe.ingredients.map((ingredient, index) => ({
    key: savedKeys === null ? `s${index}` : (savedKeys[index] ?? `f${index}`),
    name: ingredient.name,
    amount: ingredient.amount,
  }))
  const rows = ingredientDraft ?? savedRows
  // Rows that show: the ones with text, and the open one even while it is blank.
  const shownRows = rows.filter((row) => row.key === openRow || !isBlank(row))

  function openIngredient(key: string) {
    setRefocus(null)
    setIngredients(rows)
    setOpenRow(key)
  }

  function addIngredient() {
    setRefocus(null)
    clearError('ingredients', null)
    const key = `n${nextNew}`
    setNextNew(nextNew + 1)
    setIngredients([...rows, { key, name: '', amount: '' }])
    setAddingRow(key)
    setOpenRow(key)
  }

  function editRow(key: string, field: 'name' | 'amount', value: string) {
    clearError('ingredients', null)
    setIngredients(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  // Escape: the row goes back to what is saved for it (a new row is removed) and nothing is sent.
  function cancelRow(key: string) {
    const original = savedRows.find((row) => row.key === key)
    const next = rows.flatMap((row) => (row.key !== key ? [row] : original ? [original] : []))
    setIngredients(sameIngredients(payloadOf(next), recipe.ingredients) ? undefined : next)
    setRefocus(addingRow === key ? 'plus' : `row:${key}`)
    setOpenRow(null)
  }

  // Leaving a row drops the rows that are blank and saves the list if it differs from the saved one. Moving from one box
  // of a row to the other is not leaving the row, so a row being emptied is not dropped under the cursor. The row closes
  // once its save is accepted or rejected, so after a failed save it stays open with what was typed. viaEnter puts focus
  // back on the + for a new row, or on the row's text.
  function leaveRow(key: string, viaEnter: boolean) {
    const draft = ingredientRef.current
    const close = () => {
      if (viaEnter) setRefocus(addingRow === key ? 'plus' : `row:${key}`)
      setOpenRow((current) => (current === key ? null : current))
    }
    if (draft === undefined) {
      close()
      return
    }
    const kept = draft.filter((row) => !isBlank(row))
    const payload = payloadOf(draft)
    if (sameIngredients(payload, recipe.ingredients)) {
      setSavedKeys(kept.map((row) => row.key))
      setIngredients(undefined)
      close()
      return
    }
    setIngredients(draft.filter((row) => row.key === key || !isBlank(row)))
    save({
      key: 'ingredients',
      patch: { ingredients: payload },
      onSaved: () => {
        const current = ingredientRef.current
        if (current !== undefined && sameIngredients(payloadOf(current), payload)) {
          setSavedKeys(current.filter((row) => !isBlank(row)).map((row) => row.key))
          setIngredients(undefined)
          close()
        }
      },
      onRejected: () => {
        setSavedKeys(null)
        setIngredients(undefined)
        close()
      },
    })
  }

  function onRowBlur(event: FocusEvent<HTMLInputElement>, key: string) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.closest('li')?.contains(next)) return
    leaveRow(key, false)
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLInputElement>, key: string, field: 'amount' | 'name') {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelRow(key)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (field === 'amount') event.currentTarget.closest('li')?.querySelector<HTMLInputElement>('input[data-field="name"]')?.focus()
      else leaveRow(key, true)
    }
  }

  return (
    <section aria-label="Recipe card">
      <h2 className="border-b border-border pb-2 font-display text-2xl font-bold">
        {editing.title ? (
          <input
            ref={focusAndSelect}
            type="text"
            aria-label="Recipe title"
            placeholder="Recipe title"
            autoComplete="off"
            maxLength={MAX_TITLE}
            className={cn(boxClass, 'font-display text-2xl font-bold')}
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            onBlur={title.onBlur}
            onKeyDown={title.onKeyDown}
          />
        ) : (
          <button type="button" ref={trigger('title')} title="Edit recipe title" className={cn(triggerClass, 'group inline-flex items-baseline gap-2')} onClick={() => openBox('title')}>
            {recipe.title}
            <PencilIcon aria-hidden="true" className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        )}
      </h2>
      <Messages messages={errors.title} />
      <Messages messages={errors.card} />
      <Area title="Ingredients">
        <Messages messages={errors.ingredients} />
        {shownRows.length === 0 && openRow === null && <p className="text-sm text-muted-foreground">No ingredients yet.</p>}
        <ul className="grid gap-1">
          {shownRows.map((row, index) =>
            row.key === openRow ? (
              <li key={row.key} className="flex gap-2">
                <input
                  ref={focusAndSelect}
                  type="text"
                  aria-label={`Ingredient ${index + 1} amount`}
                  data-field="amount"
                  placeholder="Amount"
                  autoComplete="off"
                  maxLength={MAX_INGREDIENT_AMOUNT}
                  className={cn(boxClass, 'w-1/3')}
                  value={row.amount}
                  onChange={(e) => editRow(row.key, 'amount', e.target.value)}
                  onBlur={(e) => onRowBlur(e, row.key)}
                  onKeyDown={(e) => onRowKeyDown(e, row.key, 'amount')}
                />
                <input
                  type="text"
                  aria-label={`Ingredient ${index + 1} name`}
                  data-field="name"
                  placeholder="Ingredient"
                  autoComplete="off"
                  maxLength={MAX_INGREDIENT_NAME}
                  className={cn(boxClass, 'flex-1')}
                  value={row.name}
                  onChange={(e) => editRow(row.key, 'name', e.target.value)}
                  onBlur={(e) => onRowBlur(e, row.key)}
                  onKeyDown={(e) => onRowKeyDown(e, row.key, 'name')}
                />
              </li>
            ) : (
              <li key={row.key}>
                <button
                  type="button"
                  ref={trigger(`row:${row.key}`)}
                  title={`Edit ingredient ${index + 1}`}
                  className={cn(triggerClass, 'block w-full')}
                  onClick={() => openIngredient(row.key)}
                >
                  {`${row.amount.trim()} ${row.name.trim()}`.trim()}
                </button>
              </li>
            ),
          )}
          {/* The last row, where the next ingredient lands: the + until clicked, then the new row in its place. */}
          {openRow !== null && openRow === addingRow ? null : (
            <li>
              <Button ref={trigger('plus')} variant="ghost" size="icon-sm" className="focus-visible:ring-inset" aria-label="Add ingredient" onClick={addIngredient}>
                <PlusIcon />
              </Button>
            </li>
          )}
        </ul>
      </Area>
      <Area
        title="Prep"
        headingExtra={
          <MinutesField editing={!!editing.prep_minutes} box={prepMinutes} minutes={recipe.prep_minutes} prompt="Add prep time" label="Prep minutes" triggerRef={trigger('prep_minutes')} onOpen={() => openBox('prep_minutes')} />
        }
      >
        <Messages messages={errors.prep_minutes} />
        <InstructionsField editing={!!editing.prep_instructions} box={prep} text={recipe.prep_instructions} prompt="Add prep instructions" label="Prep instructions" triggerRef={trigger('prep_instructions')} onOpen={() => openBox('prep_instructions')} />
        <Messages messages={errors.prep_instructions} />
      </Area>
      <Area
        title="Cook"
        headingExtra={
          <MinutesField editing={!!editing.cook_minutes} box={cookMinutes} minutes={recipe.cook_minutes} prompt="Add cooking time" label="Cook minutes" triggerRef={trigger('cook_minutes')} onOpen={() => openBox('cook_minutes')} />
        }
      >
        <Messages messages={errors.cook_minutes} />
        <InstructionsField editing={!!editing.cook_instructions} box={cook} text={recipe.cook_instructions} prompt="Add cooking instructions" label="Cooking instructions" triggerRef={trigger('cook_instructions')} onOpen={() => openBox('cook_instructions')} />
        <Messages messages={errors.cook_instructions} />
      </Area>
    </section>
  )
}
