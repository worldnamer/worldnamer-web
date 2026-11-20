import { useQuery } from '@tanstack/react-query'
import { todayQuote } from '@/api/quotes'

// Today's quote. The API answers with no quote when none is saved, and then a prompt to add one is shown; while the
// answer is loading (data undefined) nothing is shown, and a failed answer shows an alert. retry is off so a down API
// shows as failed at once.
export function QuoteOfTheDay() {
  const { data: quote, isError } = useQuery({ queryKey: ['quotes', 'today'], queryFn: todayQuote, retry: false })
  if (isError) return <p role="alert" className="pl-4 text-muted-foreground">{"Could not load today's quote."}</p>
  if (quote === undefined) return null
  if (quote === null) return <p className="pl-4 text-muted-foreground">Add your first quote</p>
  return (
    <figure>
      <blockquote className="border-l-2 border-border pl-4 text-lg">{quote.text}</blockquote>
      {quote.author && <figcaption className="pl-4 text-muted-foreground">{`— ${quote.author}`}</figcaption>}
    </figure>
  )
}
