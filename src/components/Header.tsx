export function Header() {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center px-5">
        <a href="/" className="font-display text-2xl font-bold tracking-wide" aria-label="worldnamer home">
          <span className="text-brand">w</span>
          <span className="text-foreground">orldnamer</span>
        </a>
      </div>
    </header>
  )
}
