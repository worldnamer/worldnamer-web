import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { getRecipe, type Recipe } from '@/api/recipes'

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

function Minutes({ minutes }: { minutes: number | null }) {
  return minutes === null ? null : <p className="text-sm text-muted-foreground">{minutes} minutes</p>
}

function Card({ recipe }: { recipe: Recipe }) {
  return (
    <section aria-label="Recipe card">
      <h2 className="border-b border-border pb-2 font-display text-2xl font-bold">{recipe.title}</h2>
      {recipe.ingredients.length > 0 && (
        <div className="py-2">
          <h3 className="font-bold">Ingredients</h3>
          <ul className="list-disc pl-5">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>{ingredient.amount === '' ? ingredient.name : `${ingredient.amount} ${ingredient.name}`}</li>
            ))}
          </ul>
        </div>
      )}
      {(recipe.prep_instructions !== '' || recipe.prep_minutes !== null) && (
        <div className="py-2">
          <h3 className="font-bold">Prep</h3>
          <Minutes minutes={recipe.prep_minutes} />
          {recipe.prep_instructions !== '' && <p className="whitespace-pre-line">{recipe.prep_instructions}</p>}
        </div>
      )}
      {(recipe.cook_instructions !== '' || recipe.cook_minutes !== null) && (
        <div className="py-2">
          <h3 className="font-bold">Cook</h3>
          <Minutes minutes={recipe.cook_minutes} />
          {recipe.cook_instructions !== '' && <p className="whitespace-pre-line">{recipe.cook_instructions}</p>}
        </div>
      )}
    </section>
  )
}
