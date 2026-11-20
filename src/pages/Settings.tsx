import { QuoteOfTheDay } from '@/components/QuoteOfTheDay'
import { useSession } from '@/auth/useSession'
import { NotFound } from './NotFound'

// Same left alignment and gaps as YouTube. The column stays empty until the page has content.
export function Settings() {
  const { pending, user } = useSession()
  if (pending) return null // the session is being restored: show nothing yet
  if (!user) return <NotFound /> // logged out: the page does not exist
  return <section aria-label="Settings page" className="-ml-5 flex flex-col gap-4 pl-4 sm:gap-6 sm:pl-6">
      <QuoteOfTheDay />
    </section>
}
