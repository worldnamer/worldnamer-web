import { useSession } from '@/auth/useSession'
import { NotFound } from './NotFound'

// Same left alignment and gaps as Recipes. The column stays empty until the page has content.
export function YouTube() {
  const { pending, user } = useSession()
  if (pending) return null // the session is being restored: show neither view
  if (!user) return <NotFound /> // logged out: the page does not exist
  return (
    <section aria-label="YouTube page" className="-ml-5 flex flex-col gap-4 pl-4 sm:gap-6 sm:pl-6 lg:flex-row lg:items-start">
      <div className="w-full lg:w-1/2" />
    </section>
  )
}
