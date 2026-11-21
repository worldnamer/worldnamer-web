import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { createQuote } from '@/api/quotes'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The form to add a quote. The server decides what a good quote is, so the browser sends what was typed. On success
// the quotes are refetched, so today's quote and the list stay current, and the form closes. A 422 shows the API's
// own message and keeps the form open; anything else shows a generic one. Cancel and a successful save both call
// onClose, and the parent unmounts the form, which clears it.
export function QuoteForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const textId = useId()
  const authorId = useId()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: createQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      onClose()
    },
    onError: (e) => {
      const refused = e instanceof ApiError && e.status === 422 && e.serverMessage
      setError(refused || 'Something went wrong. Try again.')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    add.mutate({ text, author })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2">
      <div className="grid gap-1">
        <label htmlFor={textId} className="text-sm text-muted-foreground">
          Quote
        </label>
        <textarea
          id={textId}
          autoFocus
          rows={3}
          className={fieldClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <label htmlFor={authorId} className="text-sm text-muted-foreground">
          Author (optional)
        </label>
        <input
          id={authorId}
          type="text"
          autoComplete="off"
          className={fieldClass}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-md border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
        >
          Save quote
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
