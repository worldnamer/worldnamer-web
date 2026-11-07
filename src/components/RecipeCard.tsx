import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { getRecipe, type Recipe, type RecipeIngredient } from '@/api/recipes'
import { useRecipeSaver } from '@/lib/useRecipeSaver'
import { cn } from '@/lib/utils'

// The recipe named in the address (/recipes/:id). With no id it is a prompt, shown only from lg since below that the
// rolodex is all there is. A 404 (not the user's recipe, or gone) goes back to /recipes without a message. Every
// piece of recipe text is shown as the value of a text box, never as HTML. Keyed by id so a card's drafts and messages
// never carry over to another recipe.
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
const MAX_INGREDIENT_NAME = 100
const MAX_INGREDIENT_AMOUNT = 50

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

function MinutesBox({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <span className="flex items-baseline gap-1 text-sm text-muted-foreground">
      <input
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
      />
      min
    </span>
  )
}

// The card. Each box shows its draft, the text being typed, or else the saved value from the cache; only a box that is
// being edited has a draft, so every other box follows the cache the moment a save lands. A box saves on blur: nothing is
// sent when the text equals what is saved, and a blank title goes back to the saved one. The draft is dropped when the
// save succeeds (if the box still holds what was sent) and when the API rejects it, so the card then shows what was
// last saved.
function Card({ recipe }: { recipe: Recipe }) {
  const { save, errors, clearError } = useRecipeSaver(String(recipe.id))
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({})
  const draftsRef = useRef<Partial<Record<DraftKey, string>>>({}) // what a save's callback must see, not a render's copy

  function setDraft(key: DraftKey, value: string | undefined) {
    const next = { ...draftsRef.current }
    if (value === undefined) delete next[key]
    else next[key] = value
    draftsRef.current = next
    setDrafts(next)
  }

  function savedText(key: DraftKey): string {
    return key === 'prep_minutes' || key === 'cook_minutes' ? minutesText(recipe[key]) : recipe[key]
  }

  function textBox(key: DraftKey) {
    return {
      value: drafts[key] ?? savedText(key),
      onChange: (value: string) => {
        clearError(key, null)
        setDraft(key, value)
      },
      onBlur: () => {
        const draft = draftsRef.current[key]
        if (draft === undefined) return
        const text = draft.trim()
        if (text === savedText(key) || (key === 'title' && text === '')) {
          setDraft(key, undefined)
          return
        }
        save({
          key,
          patch: { [key]: key === 'prep_minutes' || key === 'cook_minutes' ? minutesValue(text) : text },
          onSaved: () => {
            if (draftsRef.current[key] === draft) setDraft(key, undefined)
          },
          onRejected: () => setDraft(key, undefined),
        })
      },
    }
  }

  const title = textBox('title')
  const prep = textBox('prep_instructions')
  const cook = textBox('cook_instructions')
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
  // There is always a blank row to type into: the last row, if it is blank, or else a new one with a key not yet used.
  const spareKey = rows.length > 0 && isBlank(rows[rows.length - 1]) ? null : `n${nextNew}`
  const shownRows: Row[] = spareKey === null ? rows : [...rows, { key: spareKey, name: '', amount: '' }]

  function editRow(key: string, field: 'name' | 'amount', value: string) {
    clearError('ingredients', null)
    if (key === spareKey) {
      setNextNew(nextNew + 1)
      setIngredients([...rows, { key, name: '', amount: '', [field]: value }])
    } else {
      setIngredients(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
    }
  }

  // Leaving a row's input drops the rows that are blank and saves the list if it differs from the saved one. Moving from
  // one input of a row to the other is not leaving the row, so a row being emptied is not dropped under the cursor.
  function leaveRow(event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.closest('li')?.contains(next)) return
    const draft = ingredientRef.current
    if (draft === undefined) return
    const kept = draft.filter((row) => !isBlank(row))
    const payload = payloadOf(draft)
    if (sameIngredients(payload, recipe.ingredients)) {
      setSavedKeys(kept.map((row) => row.key))
      setIngredients(undefined)
      return
    }
    setIngredients(kept)
    save({
      key: 'ingredients',
      patch: { ingredients: payload },
      onSaved: () => {
        const current = ingredientRef.current
        if (current !== undefined && sameIngredients(payloadOf(current), payload)) {
          setSavedKeys(current.filter((row) => !isBlank(row)).map((row) => row.key))
          setIngredients(undefined)
        }
      },
      onRejected: () => {
        setSavedKeys(null)
        setIngredients(undefined)
      },
    })
  }

  const prepMinutes = textBox('prep_minutes')
  const cookMinutes = textBox('cook_minutes')

  return (
    <section aria-label="Recipe card">
      <h2 className="border-b border-border pb-2 font-display text-2xl font-bold">
        <input
          type="text"
          aria-label="Recipe title"
          placeholder="Recipe title"
          autoComplete="off"
          maxLength={MAX_TITLE}
          className={cn(boxClass, 'font-display text-2xl font-bold')}
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
        />
      </h2>
      <Messages messages={errors.title} />
      <Messages messages={errors.card} />
      <Area title="Ingredients">
        <Messages messages={errors.ingredients} />
        <ul>
          {shownRows.map((row, index) => (
            <li key={row.key} className="flex gap-2 pb-1">
              <input
                type="text"
                aria-label={`Ingredient ${index + 1} amount`}
                placeholder="Amount"
                autoComplete="off"
                maxLength={MAX_INGREDIENT_AMOUNT}
                className={cn(boxClass, 'w-1/3')}
                value={row.amount}
                onChange={(e) => editRow(row.key, 'amount', e.target.value)}
                onBlur={leaveRow}
              />
              <input
                type="text"
                aria-label={`Ingredient ${index + 1} name`}
                placeholder="Ingredient"
                autoComplete="off"
                maxLength={MAX_INGREDIENT_NAME}
                className={cn(boxClass, 'flex-1')}
                value={row.name}
                onChange={(e) => editRow(row.key, 'name', e.target.value)}
                onBlur={leaveRow}
              />
            </li>
          ))}
        </ul>
      </Area>
      <Area
        title="Prep"
        headingExtra={<MinutesBox label="Prep minutes" value={prepMinutes.value} onChange={prepMinutes.onChange} onBlur={prepMinutes.onBlur} />}
      >
        <Messages messages={errors.prep_minutes} />
        <textarea
          aria-label="Prep instructions"
          placeholder="Prep instructions"
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          className={boxClass}
          value={prep.value}
          onChange={(e) => prep.onChange(e.target.value)}
          onBlur={prep.onBlur}
        />
        <Messages messages={errors.prep_instructions} />
      </Area>
      <Area
        title="Cook"
        headingExtra={<MinutesBox label="Cook minutes" value={cookMinutes.value} onChange={cookMinutes.onChange} onBlur={cookMinutes.onBlur} />}
      >
        <Messages messages={errors.cook_minutes} />
        <textarea
          aria-label="Cooking instructions"
          placeholder="Cooking instructions"
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          className={boxClass}
          value={cook.value}
          onChange={(e) => cook.onChange(e.target.value)}
          onBlur={cook.onBlur}
        />
        <Messages messages={errors.cook_instructions} />
      </Area>
    </section>
  )
}
