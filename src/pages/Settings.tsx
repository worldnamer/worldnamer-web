import { PlusIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { QuoteForm } from '@/components/QuoteForm'
import { QuoteOfTheDay } from '@/components/QuoteOfTheDay'
import { QuotesManage } from '@/components/QuotesManage'
import { Button } from '@/components/ui/button'
import { useSession } from '@/auth/useSession'
import { NotFound } from './NotFound'

// Same left alignment and gaps as YouTube. The column stays empty until the page has content.
export function Settings() {
  const { pending, user } = useSession()
  // The quote form is hidden until the plus button opens it. The button is disabled while it is open, and focus
  // returns to it when a quote is deleted, since the row's button goes away.
  const [adding, setAdding] = useState(false)
  const plusRef = useRef<HTMLButtonElement>(null)
  if (pending) return null // the session is being restored: show nothing yet
  if (!user) return <NotFound /> // logged out: the page does not exist
  return (
    <section aria-label="Settings page" className="-ml-5 flex flex-col gap-4 pl-4 sm:gap-6 sm:pl-6 lg:flex-row lg:items-start">
      <div className="w-full lg:w-1/2">
        <section aria-labelledby="quotes-heading" className="w-full">
          <div className="flex min-h-10 items-center border-b border-border pb-2">
            <h2 id="quotes-heading" className="break-words font-display text-xl tracking-wide">
              Quotes
            </h2>
            <Button
              ref={plusRef}
              variant="ghost"
              size="icon-sm"
              aria-label="Add quote"
              className="ml-auto"
              disabled={adding}
              onClick={() => setAdding(true)}
            >
              <PlusIcon />
            </Button>
          </div>
          <div className="grid gap-6 border-b border-border py-3">
            <QuoteOfTheDay />
            <QuotesManage focusAfterDelete={() => plusRef.current} />
            {adding && <QuoteForm onClose={() => setAdding(false)} />}
          </div>
        </section>
      </div>
    </section>
  )
}
