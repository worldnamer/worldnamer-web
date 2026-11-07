import type { ReactNode } from 'react'
import { useSession } from '@/auth/useSession'
import { Footer } from './Footer'
import { Header } from './Header'
import { SectionTabs } from './SectionTabs'

// The frame around every page: header on top, footer pinned to the bottom even on short pages. A logged-in user also
// gets the section tabs to the right of the page content (nothing while the session is pending or logged out).
export function Layout({ children }: { children: ReactNode }) {
  const { user } = useSession()
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex w-full flex-1 gap-6 px-5 pb-6 pt-4 sm:pb-12 sm:pt-6">
        <main className="min-w-0 flex-1">{children}</main>
        {user ? <SectionTabs /> : null}
      </div>
      <Footer />
    </div>
  )
}
