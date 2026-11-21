import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { todayQuote } from '@/api/quotes'
import { useSession } from '@/auth/useSession'

const DEFAULT_TAGLINE = 'I use tech to empower people.'
const TAGLINE_LIMIT = 100

const links = [
  { label: 'LinkedIn', href: 'https://linkedin.com/in/worldnamer' },
  { label: 'GitHub', href: 'https://github.com/worldnamer' },
]

// Computed once when the page loads, not on every render.
const year = new Date().getFullYear()

export function Footer() {
  // Only a logged-in visitor has a quote, so nothing is fetched until the session says who is logged in.
  const { user } = useSession()
  const { data: quote } = useQuery({
    queryKey: ['quotes', 'today'],
    queryFn: todayQuote,
    retry: false,
    enabled: user !== null,
  })
  const full = quote ? (quote.author ? `${quote.text}—${quote.author}` : quote.text) : DEFAULT_TAGLINE
  // Counted in code points, as the API counts quote length, so an emoji is never split in half.
  const characters = [...full]
  const cut = characters.length > TAGLINE_LIMIT
  const tagline = cut ? `${characters.slice(0, TAGLINE_LIMIT).join('')}…` : full

  return (
    <footer className="border-t">
      <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:py-4 sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <p className="font-display text-base text-foreground" title={cut ? full : undefined}>
            {tagline}
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            © {year}<span className="hidden sm:inline"> John LeBoeuf-Little</span>
          </p>
        </div>
        <nav aria-label="Elsewhere" className="flex gap-6 text-sm">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <Link to="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
