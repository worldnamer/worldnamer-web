import { Trash2Icon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteQuote, listQuotes, type Quote } from '@/api/quotes'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { revealOnHover } from '@/lib/revealOnHover'
import { useConfirmDelete } from '@/lib/useConfirmDelete'
import { cn } from '@/lib/utils'

// Lists every saved quote in the order the API gives them. Each quote can be deleted after a confirmation. Renders
// nothing when there are no quotes.
export function QuotesManage({ focusAfterDelete }: { focusAfterDelete: () => HTMLElement | null }) {
  const queryClient = useQueryClient()
  const del = useConfirmDelete<Quote>(focusAfterDelete)
  const { data: quotes } = useQuery({ queryKey: ['quotes', 'list'], queryFn: listQuotes, retry: false })
  const remove = useMutation({
    mutationFn: (quote: Quote) => deleteQuote(quote.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })
  if (!quotes || quotes.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {quotes.map((quote) => (
          <li key={quote.id} className="group flex items-center justify-between gap-3">
            <span>
              {quote.text}
              {quote.author && <span className="text-muted-foreground"> — {quote.author}</span>}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn('text-muted-foreground hover:text-foreground', revealOnHover)}
              aria-label={`Delete quote: ${quote.text}`}
              onClick={(event) => del.ask(quote, event.currentTarget)}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDeleteDialog
        open={del.open}
        onOpenChange={del.setOpen}
        title="Delete this quote?"
        onConfirm={() => {
          if (del.target) remove.mutate(del.target)
        }}
        // After a confirmed delete focus goes to the element focusAfterDelete returns, since the row's button is
        // going away; after Cancel it goes back to the button that opened the dialog.
        focusAfterClose={del.focusAfterClose}
      />
    </div>
  )
}
