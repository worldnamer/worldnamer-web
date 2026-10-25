import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

// The frame around every page: header on top, footer pinned to the bottom even on short pages.
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="w-full flex-1 px-5 pb-12 pt-6">{children}</main>
      <Footer />
    </div>
  )
}
