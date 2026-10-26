import { useId } from 'react'
import type { Side, TimelineEvent } from '@/data/resume'
import { formatPeriod } from '@/lib/dates'
import { useHoverIntent } from '@/lib/useHoverIntent'
import { cn } from '@/lib/utils'
import { Chip } from './Chip'
import { TimelineItem } from './TimelineItem'

type Role = Extract<TimelineEvent, { kind: 'role' }>

// How long the mouse has to rest on a folded card before it opens by itself.
const HOVER_OPEN_MS = 500

export function RoleCard({
  role,
  side,
  open,
  onOpenChange,
}: {
  role: Role
  side: Side
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detailsId = useId()
  const hasDetails = role.bullets.length > 0
  const foldedUp = hasDetails && !open
  const hover = useHoverIntent(() => onOpenChange(true), HOVER_OPEN_MS, foldedUp)

  return (
    <TimelineItem
      side={side}
      variant="card"
      cardProps={{ ...hover, className: 'transition-colors hover:border-brand/60' }}
    >
      <p className="text-brand text-sm font-semibold">{role.employer}</p>
      <h3 className="font-display text-xl font-bold">{role.title}</h3>
      <p className="text-muted-foreground text-sm">
        {formatPeriod(role.start, role.end)}
        {role.location && ` · ${role.location}`}
      </p>
      {role.summary && <p className="mt-3">{role.summary}</p>}
      {hasDetails && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => onOpenChange(!open)}
            className="text-muted-foreground hover:text-foreground mt-3 cursor-pointer text-sm"
          >
            {open ? '− Hide details' : '+ Show details'}
          </button>
          {/* A grid row that goes from 0fr to 1fr animates the height in every browser (<details> cannot be
              animated in Firefox). While folded, `inert` keeps the clipped text out of reach of the keyboard
              and screen readers. */}
          <div
            id={detailsId}
            inert={!open}
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
              open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <ul className="marker:text-muted-foreground list-disc space-y-1.5 pt-3 pl-5">
                {role.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
      {(role.skills || role.concepts || role.tech) && (
        <ul aria-label="Skills and technologies" className="mt-4 flex flex-wrap gap-2">
          {role.skills?.map((skill) => (
            <Chip key={skill} variant="skill">
              {skill}
            </Chip>
          ))}
          {role.concepts?.map((concept) => (
            <Chip key={concept} variant="concept">
              {concept}
            </Chip>
          ))}
          {role.tech?.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </ul>
      )}
    </TimelineItem>
  )
}
