import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Page not found</h1>
      <Link to="/" className="underline">
        Back to home
      </Link>
    </div>
  )
}
