import { QuoteForm } from '@/components/QuoteForm'
import { QuoteOfTheDay } from '@/components/QuoteOfTheDay'
import { QuotesManage } from '@/components/QuotesManage'
import { useSession } from '@/auth/useSession'
import { NotFound } from './NotFound'

// Same left alignment and gaps as YouTube. The column stays empty until the page has content.
export function Settings() {
  const { pending, user } = useSession()
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
          </div>
          <div className="grid gap-6 border-b border-border py-3">
            <QuoteOfTheDay />
            <QuoteForm />
            <QuotesManage focusAfterDelete={() => null} />
          </div>
        </section>
      </div>
    </section>
  )
}
