import type { ComponentProps, ReactNode } from 'react'
import type { Side } from '@/data/resume'
import { cn } from '@/lib/utils'

// One entry on the timeline: a node on the wire, and content beside it.
// Below 768px the wire runs down the left edge and everything is one column; from 768px the wire is the page
// center and entries alternate sides. The wire itself is drawn by the <ol> in Timeline.tsx.
export function TimelineItem({
  side,
  variant,
  cardProps,
  children,
}: {
  side: Side
  variant: 'card' | 'note'
  // Extra props for the card (a class, hover handlers). Only used when variant is 'card'.
  cardProps?: ComponentProps<'article'>
  children: ReactNode
}) {
  const isCard = variant === 'card'

  return (
    <li className="relative pl-6 md:grid md:grid-cols-2 md:pl-0">
      <span
        aria-hidden
        className={cn(
          'bg-brand absolute top-1/2 -translate-y-1/2 rounded-full md:left-1/2 md:-translate-x-1/2',
          isCard ? '-left-[5px] size-2.5 shadow-[0_0_8px_var(--brand)]' : '-left-[3px] size-1.5 opacity-70',
        )}
      />
      <div
        className={cn(
          'w-full md:max-w-xl',
          side === 'left' ? 'md:col-start-1 md:justify-self-end md:pr-8' : 'md:col-start-2 md:justify-self-start md:pl-8',
        )}
      >
        {isCard ? (
          <article {...cardProps} className={cn('bg-panel rounded-lg border p-5', cardProps?.className)}>
            {children}
          </article>
        ) : (
          children
        )}
      </div>
    </li>
  )
}
