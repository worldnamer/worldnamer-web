import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Trash2Icon } from 'lucide-react'
import { ApiError } from '@/api/client'
import { createRecipe, deleteRecipe, listRecipes } from '@/api/recipes'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { clearLastRecipe, forgetLastRecipe, getLastRecipe } from '@/lib/lastRecipe'
import { revealOnHover } from '@/lib/revealOnHover'
import { cn } from '@/lib/utils'

// The user's recipe titles, each a link to its recipe card. The selected recipe comes from the address (/recipes/:id)
// and is marked as the current page. The titles are plain text. The Add recipe button is there in every list state: it
// makes a "New recipe" and opens its card. The card's cache entry is filled from the answer so it needs no fetch of its
// own, and the list is refetched to put the title in its sorted place. A failure shows one fixed line, never the
// server's text.
//
// Each title has a trash button that asks to delete it; the one dialog below holds the recipe asked about. Once deleted,
// the recipe's cache entry is dropped before anything else changes, so the card can never fetch it again, and only if it
// was the selected recipe does the page go back to /recipes. A failure shows one fixed line, never the server's text.
export function RecipeRolodex() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<{ id: number; title: string } | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the trash button that opened the dialog
  const addRef = useRef<HTMLButtonElement>(null)
  // The recipe selected now, which may differ from the one selected when a delete was confirmed.
  const selectedId = useRef(id)
  useEffect(() => {
    selectedId.current = id
  }, [id])
  const busy = useRef(false) // set at once, since the button is only disabled on the next render
  const { data, isPending, isError } = useQuery({ queryKey: ['recipes'], queryFn: listRecipes, retry: false })
  // Opening /recipes with no recipe in the address reopens the last one viewed, if it is still in the list; replace keeps
  // Back from bouncing to /recipes and forward again. An id no longer in the list is forgotten. An address with an id
  // is never touched.
  useEffect(() => {
    if (id !== undefined || !data) return
    const saved = getLastRecipe()
    if (saved === null) return
    if (data.some((recipe) => String(recipe.id) === saved)) navigate(`/recipes/${saved}`, { replace: true })
    else clearLastRecipe()
  }, [id, data, navigate])
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
  const remove = useMutation({
    mutationFn: (recipe: { id: number; title: string }) => deleteRecipe(String(recipe.id)),
    onMutate: () => setDeleteFailed(false),
    onSuccess: (_result, { id: gone }) => {
      const goneId = String(gone)
      // Order matters: the saved id and the card's cache entry go first, so neither the redirect for /recipes nor the
      // card can bring the deleted recipe back or fetch it.
      forgetLastRecipe(goneId)
      queryClient.removeQueries({ queryKey: ['recipes', goneId], exact: true })
      void queryClient.invalidateQueries({ queryKey: ['recipes'], exact: true })
      if (selectedId.current === goneId) navigate('/recipes')
    },
    onError: (e, { id: gone }) => {
      // A 404 means the recipe was already deleted elsewhere: fetch the list again, quietly.
      if (e instanceof ApiError && e.status === 404) {
        const goneId = String(gone)
        void queryClient.invalidateQueries({ queryKey: ['recipes'], exact: true })
        if (selectedId.current === goneId) {
          forgetLastRecipe(goneId)
          navigate('/recipes')
        }
        return
      }
      setDeleteFailed(true)
    },
  })

  function askToDelete(recipe: { id: number; title: string }, button: HTMLElement) {
    opener.current = button
    setTarget(recipe)
    setOpen(true)
  }

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
              // `group` lets the trash button reveal itself while the row is hovered or holds focus.
              <li key={recipe.id} className="group flex items-center">
                <Link
                  to={`/recipes/${recipe.id}`}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'block min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground',
                    selected ? 'bg-panel text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {recipe.title}
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn('text-muted-foreground hover:text-foreground', revealOnHover)}
                  aria-label={`Delete ${recipe.title}`}
                  onClick={(event) => askToDelete(recipe, event.currentTarget)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Button ref={addRef} variant="outline" size="sm" disabled={create.isPending} onClick={() => {
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
      {deleteFailed && (
        <p role="alert" className="text-sm text-destructive">
          Could not delete the recipe. Try again.
        </p>
      )}
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete '${target?.title ?? ''}'?`}
        onConfirm={() => {
          if (target) remove.mutate(target)
        }}
        // After a confirmed delete the recipe's own button is going away, so focus goes to Add recipe; after Cancel it
        // goes back to the button that opened the dialog.
        focusAfterClose={(confirmed) => (confirmed ? addRef.current : opener.current)}
      />
    </section>
  )
}
