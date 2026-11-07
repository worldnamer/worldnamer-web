import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { listRecipes } from '@/api/recipes'
import { cn } from '@/lib/utils'

// The user's recipe titles, each a link to its recipe card. The selected recipe comes from the address (/recipes/:id)
// and is marked as the current page. The titles are plain text.
export function RecipeRolodex() {
  const { id } = useParams()
  const { data, isPending, isError } = useQuery({ queryKey: ['recipes'], queryFn: listRecipes, retry: false })

  return (
    <section aria-label="Recipes">
      <h2 className="border-b border-border pb-2 font-display text-lg font-bold">Recipes</h2>
      {isPending ? null : isError ? (
        <p role="alert" className="py-2 text-sm text-muted-foreground">
          Could not load recipes.
        </p>
      ) : data.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No recipes yet.</p>
      ) : (
        <ul className="py-2">
          {data.map((recipe) => {
            const selected = String(recipe.id) === id
            return (
              <li key={recipe.id}>
                <Link
                  to={`/recipes/${recipe.id}`}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground',
                    selected ? 'bg-panel text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {recipe.title}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
