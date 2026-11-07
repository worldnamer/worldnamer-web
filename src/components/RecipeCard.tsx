import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { getRecipe, type Recipe } from '@/api/recipes'
import { formatMinutes } from '@/lib/duration'

// The recipe named in the address (/recipes/:id). With no id it is a prompt, shown only from lg since below that the
// rolodex is all there is. A 404 (not the user's recipe, or gone) goes back to /recipes without a message. Every
// piece of recipe text is rendered as a plain text node; line breaks in the instructions are kept by CSS.
export function RecipeCard() {
  const { id } = useParams()
  if (id === undefined) return <p className="hidden text-sm text-muted-foreground lg:block">Pick a recipe or add one</p>
  return <SelectedRecipe id={id} />
}

function SelectedRecipe({ id }: { id: string }) {
  // retry: false so a 404 redirects at once, and a down API shows the failure line at once.
  const { data, error, isPending } = useQuery({ queryKey: ['recipes', id], queryFn: () => getRecipe(id), retry: false })

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

function Card({ recipe }: { recipe: Recipe }) {
  return (
    <section aria-label="Recipe card">
      <h2 className="border-b border-border pb-2 font-display text-2xl font-bold">{recipe.title}</h2>
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
        {recipe.prep_instructions !== '' ? (
          <p className="whitespace-pre-line">{recipe.prep_instructions}</p>
        ) : (
          recipe.prep_minutes === null && <Empty>No prep.</Empty>
        )}
      </Area>
      <Area title="Cook" minutes={recipe.cook_minutes}>
        {recipe.cook_instructions !== '' ? (
          <p className="whitespace-pre-line">{recipe.cook_instructions}</p>
        ) : (
          recipe.cook_minutes === null && <Empty>No cooking.</Empty>
        )}
      </Area>
    </section>
  )
}
