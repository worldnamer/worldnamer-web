import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { createRecipe, listRecipes } from '@/api/recipes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The user's recipe titles, each a link to its recipe card. The selected recipe comes from the address (/recipes/:id)
// and is marked as the current page. The titles are plain text. The Add recipe button is there in every list state: it
// makes a "New recipe" and opens its card. The card's cache entry is filled from the answer so it needs no fetch of its
// own, and the list is refetched to put the title in its sorted place. A failure shows one fixed line, never the
// server's text.
export function RecipeRolodex() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState(false)
  const busy = useRef(false) // set at once, since the button is only disabled on the next render
  const { data, isPending, isError } = useQuery({ queryKey: ['recipes'], queryFn: listRecipes, retry: false })
  const create = useMutation({
    mutationFn: createRecipe,
    onMutate: () => setFailed(false),
    onSettled: () => {
      busy.current = false
    },
    onSuccess: (recipe) => {
      // Same key as the card's query, whose id comes from the address and so is a string.
      queryClient.setQueryData(['recipes', String(recipe.id)], recipe)
      void queryClient.invalidateQueries({ queryKey: ['recipes'], exact: true })
      navigate(`/recipes/${recipe.id}`)
    },
    onError: () => setFailed(true),
  })

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
      <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => {
          if (busy.current) return
          busy.current = true
          create.mutate()
        }}>
        {create.isPending ? 'Adding...' : 'Add recipe'}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Could not add the recipe. Try again.
        </p>
      )}
    </section>
  )
}
