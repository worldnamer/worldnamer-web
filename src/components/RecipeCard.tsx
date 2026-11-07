import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { getRecipe, type Recipe } from '@/api/recipes'
import { formatMinutes } from '@/lib/duration'
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

// An area of the card: a heading with a rule under it, and, for Prep and Cook, the time on the heading line, right-aligned ("0 min" when none is set).
function Area({ title, minutes, children }: { title: string; minutes?: number | null; children: ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between border-b border-border pb-1">
        <h3 className="font-bold">{title}</h3>
        {minutes !== undefined && (
          <span className="text-sm text-muted-foreground">{formatMinutes(minutes ?? 0)}</span>
        )}
      </div>
      <div className="pt-2">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
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

// The limits the API enforces, so a box stops typing at them. The API still checks every value.
const MAX_TITLE = 100
const MAX_INSTRUCTIONS = 10_000

// The card. Each box shows its draft, the text being typed, or else the saved value from the cache; only a box that is
// being edited has a draft, so every other box follows the cache the moment a save lands. A box saves on blur: nothing is
// sent when the text equals what is saved, and a blank title goes back to the saved one. The draft is dropped when the
// save succeeds (if the box still holds what was sent) and when the API rejects it, so the card then shows what was
// last saved.
function Card({ recipe }: { recipe: Recipe }) {
  const { save, errors, clearError } = useRecipeSaver(String(recipe.id))
  const [drafts, setDrafts] = useState<Partial<Record<TextKey, string>>>({})
  const draftsRef = useRef<Partial<Record<TextKey, string>>>({}) // what a save's callback must see, not a render's copy

  function setDraft(key: TextKey, value: string | undefined) {
    const next = { ...draftsRef.current }
    if (value === undefined) delete next[key]
    else next[key] = value
    draftsRef.current = next
    setDrafts(next)
  }

  function textBox(key: TextKey) {
    return {
      value: drafts[key] ?? recipe[key],
      onChange: (value: string) => {
        clearError(key, null)
        setDraft(key, value)
      },
      onBlur: () => {
        const draft = draftsRef.current[key]
        if (draft === undefined) return
        const text = draft.trim()
        if (text === recipe[key] || (key === 'title' && text === '')) {
          setDraft(key, undefined)
          return
        }
        save({
          key,
          patch: { [key]: text },
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
        {recipe.ingredients.length === 0 ? (
          <Empty>No ingredients.</Empty>
        ) : (
          <ul className="list-disc pl-5">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>{ingredient.amount === '' ? ingredient.name : `${ingredient.amount} ${ingredient.name}`}</li>
            ))}
          </ul>
        )}
      </Area>
      <Area title="Prep" minutes={recipe.prep_minutes}>
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
      <Area title="Cook" minutes={recipe.cook_minutes}>
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
