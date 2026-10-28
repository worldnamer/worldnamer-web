import { Link, NavLink } from 'react-router'
import { cn } from '@/lib/utils'

const navLinks = [
  { label: 'Résumé', to: '/resume' },
]

export function Header() {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/" className="font-display text-2xl font-bold tracking-wide" aria-label="worldnamer home">
          <span className="text-brand">w</span>
          <span className="text-foreground">orldnamer</span>
        </Link>
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
      </div>
    </header>
  )
}
