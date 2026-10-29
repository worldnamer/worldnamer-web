import { Link, NavLink } from 'react-router'
import { useSession } from '@/auth/useSession'
import { cn } from '@/lib/utils'
import { AccountMenu } from './AccountMenu'
import { LoginDialog } from './LoginDialog'

const navLinks = [
  { label: 'Résumé', to: '/resume' },
]

export function Header() {
  const { pending, user } = useSession()
  return (
    <header className="border-b">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/" className="font-display text-2xl font-bold tracking-wide" aria-label="worldnamer home">
          <span className="text-brand">w</span>
          <span className="text-foreground">orldnamer</span>
        </Link>
        <div className="flex items-center gap-4">
          <nav aria-label="Main" className="flex gap-6 text-sm">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn('transition-colors hover:text-foreground', isActive ? 'text-foreground' : 'text-muted-foreground')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          {/* Fixed-width slot, so the header does not shift when the session answers. Empty while pending. */}
          <div className="flex h-9 w-16 items-center justify-end">
            {pending ? null : user ? <AccountMenu username={user.username} /> : <LoginDialog />}
          </div>
        </div>
      </div>
    </header>
  )
}
