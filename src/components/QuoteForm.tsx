import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { createQuote } from '@/api/quotes'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The form to add a quote. The server decides what a good quote is, so the browser sends what was typed. On success
// both fields clear and the quotes are refetched, so today's quote and the list stay current. A 422 shows the API's
// own message; anything else shows a generic one.
export function QuoteForm() {
  const queryClient = useQueryClient()
  const textId = useId()
  const authorId = useId()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: createQuote,
    onSuccess: () => {
      setText('')
      setAuthor('')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
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
      <div>
        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-md border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
        >
          Add quote
        </button>
      </div>
    </form>
  )
}
