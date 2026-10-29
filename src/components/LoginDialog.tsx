import { useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { login } from '@/api/session'
import { loginErrorMessage } from '@/auth/errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// The Login button and the modal it opens. The two fields are "controlled": React state is the source of truth for
// what the inputs show. The password lives only in that state and is wiped whenever the dialog closes.
export function LoginDialog() {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setUsername('')
    setPassword('')
    setError(null)
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault() // first, always: a password must never end up in the URL
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      handleOpenChange(false)
    } catch (e) {
      setError(loginErrorMessage(e instanceof ApiError ? e.status : null))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          Login
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="border-border bg-panel">
        <form method="post" onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-wide">Login</DialogTitle>
            <DialogDescription className="sr-only">Enter your username and password.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="login-username" className="text-sm text-muted-foreground">
              Username
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="login-password" className="text-sm text-muted-foreground">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              Login
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
