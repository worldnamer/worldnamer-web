import { useSession } from '@/auth/useSession'
import { RecipeRolodex } from '../components/RecipeRolodex'
import { NotFound } from './NotFound'

// Same left alignment and gaps as LoggedInHome. The rolodex comes first in the DOM and, from lg, sits in the quarter
// column on the right; the half-width column is where the recipe card goes.
export function Recipes() {
  const { pending, user } = useSession()
  if (pending) return null // the session is being restored: show neither view
  if (!user) return <NotFound /> // logged out: the page does not exist, and nothing is fetched
  return (
    <section aria-label="Recipes page" className="-ml-5 flex flex-col gap-4 pl-4 sm:gap-6 sm:pl-6 lg:flex-row lg:items-start">
      <div className="w-full lg:order-last lg:w-1/4">
        <RecipeRolodex />
      </div>
      <div className="w-full lg:w-1/2" />
    </section>
  )
}
