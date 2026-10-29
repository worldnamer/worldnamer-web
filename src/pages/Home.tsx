import { useSession } from '@/auth/useSession'
import { Dossier } from '../components/Dossier'
import { LoggedInHome } from '../components/LoggedInHome'

export function Home() {
  const { pending, user } = useSession()
  if (pending) return null // the session is being restored: show neither view, to avoid flashing the wrong one
  if (user) return <LoggedInHome />
  return (
    <div className="pb-4 sm:pb-8">
      <Dossier />
    </div>
  )
}
