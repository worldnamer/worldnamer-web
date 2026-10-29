import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { SessionUser } from '@/api/client'
import { restoreSession } from '@/api/session'
import { hasSessionFlag } from '@/auth/sessionFlag'

const SESSION_KEY = ['session']

// The one place components learn who is logged in. The ['session'] query is also written by login() and logout().
// useQuery restores the session on load, but only when the hasSession flag is set, so a visitor who never logged in
// makes no request and is reported as "no session" at once. staleTime Infinity: never refetch on its own (the refresh
// token rotates); retry false: a 401 means "not logged in", not "try again".
export function useSession(): { pending: boolean; user: SessionUser | null } {
  const queryClient = useQueryClient()
  const flag = hasSessionFlag()
  const { isPending } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: restoreSession,
    enabled: flag,
    retry: false,
    staleTime: Infinity,
  })

  // logout() calls queryClient.clear(), which deletes the query object that useQuery above is watching, then writes
  // a fresh one. The old watcher never hears about it. So the value we show is read straight from the cache, and
  // this component re-renders whenever the cache changes.
  const data = useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(onChange),
    () => queryClient.getQueryData<SessionUser | null>(SESSION_KEY),
  )

  return { pending: flag && isPending && data === undefined, user: data ?? null }
}
