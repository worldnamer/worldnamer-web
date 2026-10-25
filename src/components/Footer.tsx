const links = [
  { label: 'LinkedIn', href: 'https://linkedin.com/in/worldnamer' },
  { label: 'GitHub', href: 'https://github.com/worldnamer' },
]

// Computed once when the page loads, not on every render.
const year = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="border-t">
      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <p className="font-display text-base text-foreground">I use tech to empower people.</p>
          <p className="text-muted-foreground text-sm">© {year} worldnamer</p>
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
        </nav>
      </div>
    </footer>
  )
}
