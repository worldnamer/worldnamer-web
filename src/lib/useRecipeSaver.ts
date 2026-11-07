import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/client'
import { updateRecipe, type Recipe, type RecipePatch } from '@/api/recipes'

export const SAVE_FAILED_MESSAGE = 'Could not save. Try again.'

// What one save is about. key says which box it came from, so its message lands beside that box. onSaved runs when the
// API accepted the patch (the caller drops its draft if the box still holds what was sent). onRejected runs on a 422
// (the caller drops its draft, since the card goes back to what was last saved).
export type SaveRequest = {
  key: string
  patch: RecipePatch
  onSaved: () => void
  onRejected: () => void
}

// Messages by box key. A box that has no entry has nothing to say. 'card' is for a rejection that names no box here.
export type SaveErrors = Record<string, string[]>

// Saves for one recipe card.
//
// Saves go through one promise chain, so they reach the API one at a time in the order they were asked for. Each
// response is therefore newer than the one before, and a slow earlier answer cannot overwrite a later one. A failed
// save does not stop the chain; the next one carries only its own field, so it does not need the failed one's value.
//
// When a save lands, any older refetch of the recipe is cancelled and the cache entry is replaced with the recipe the API
// returned. The list is refetched when the title changed, so the rolodex shows it in its alphabetical place. The cache
// is written inside the chain, so it follows the same order as the requests, and also when the card has been left
// since. The outcome callbacks are options of the mutation itself, not of mutate(), because mutate's callbacks are
// skipped once the card has unmounted.
export function useRecipeSaver(id: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const mounted = useRef(true)
  const [errors, setErrors] = useState<SaveErrors>({})

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const setError = useCallback((key: string, messages: string[] | null) => {
    setErrors((current) => {
      if (messages === null) {
        if (!(key in current)) return current
        const rest = { ...current }
        delete rest[key]
        return rest
      }
      return { ...current, [key]: messages }
    })
  }, [])

  async function land(recipe: Recipe) {
    const key = ['recipes', id]
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<Recipe>(key)
    queryClient.setQueryData(key, recipe)
    if (previous?.title !== recipe.title) void queryClient.invalidateQueries({ queryKey: ['recipes'], exact: true })
  }

  const mutation = useMutation({
    mutationFn: (request: SaveRequest) => {
      const step = chain.current.then(async () => {
        const recipe = await updateRecipe(id, request.patch)
        await land(recipe)
        return recipe
      })
      chain.current = step.catch(() => undefined)
      return step
    },
    onSuccess: (_recipe, request) => {
      setError(request.key, null)
      request.onSaved()
    },
    onError: (error, request) => {
      if (error instanceof ApiError && error.status === 404) {
        // The recipe is gone or was never the user's: forget it, and leave unless the user has already moved on.
        queryClient.removeQueries({ queryKey: ['recipes', id] })
        void queryClient.invalidateQueries({ queryKey: ['recipes'], exact: true })
        if (mounted.current) navigate('/recipes', { replace: true })
        return
      }
      if (error instanceof ApiError && error.status === 422) {
        request.onRejected()
        const own = error.fields?.[request.key]
        if (own && own.length > 0) {
          setError(request.key, own)
        } else {
          setError('card', [error.serverMessage ?? SAVE_FAILED_MESSAGE])
        }
        return
      }
      // A network error, a 5xx, a 429 or a 400: never show what the server said. The draft stays so the next blur retries.
      setError(request.key, [SAVE_FAILED_MESSAGE])
    },
  })

  const { mutate } = mutation
  const save = useCallback(
    (request: SaveRequest) => {
      setError(request.key, null)
      mutate(request)
    },
    [mutate, setError],
  )

  return { save, errors, clearError: setError }
}
