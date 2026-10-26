import { useState } from 'react'
import type { TimelineEvent } from '@/data/resume'
import { assignSides } from '@/lib/timeline'
import { EducationCard } from './EducationCard'
import { MilestoneNote } from './MilestoneNote'
import { RoleCard } from './RoleCard'
import { StatusCard } from './StatusCard'

function eventKey(event: TimelineEvent): string {
  switch (event.kind) {
    case 'status':
      return 'status'
    case 'education':
      return 'education'
    case 'milestone':
      return `milestone-${event.date}-${event.text}`
    case 'role':
      return `role-${event.employer}-${event.title}`
  }
}

type Role = Extract<TimelineEvent, { kind: 'role' }>

// The timeline view of the résumé data: a wire with events on it, newest first.
export function Timeline({ events }: { events: TimelineEvent[] }) {
  // A milestone with no text is a placeholder still to be written; leave it off the page.
  const shown = events.filter((event) => event.kind !== 'milestone' || event.text.trim() !== '')
  // The status banner sits above the wire and the education card below it. The rest alternate sides, so count only those.
  const status = shown.find((event) => event.kind === 'status')
  const education = shown.find((event) => event.kind === 'education')
  const onWire = shown.filter((event) => event.kind !== 'status' && event.kind !== 'education')
  const sides = assignSides(onWire)
  const roles = onWire.filter((event): event is Role => event.kind === 'role')

  // Which role cards are open. It lives here, not in each card, so "Expand all" can reach every card.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(roles.map((role) => [eventKey(role), !role.collapsed])),
  )
  const allOpen = roles.every((role) => open[eventKey(role)])
  const setAll = (value: boolean) => setOpen(Object.fromEntries(roles.map((role) => [eventKey(role), value])))

  const toggleAll = (
    <button
      type="button"
      onClick={() => setAll(!allOpen)}
      className="text-muted-foreground hover:text-foreground cursor-pointer text-sm"
    >
      {allOpen ? 'Collapse all' : 'Expand all'}
    </button>
  )

  return (
    <div>
      {status ? (
        <>
          {/* From 768px: the banner stays centered and the button sits to its right, level with its middle.
              On a phone the button drops under the banner. */}
          <div className="md:grid md:grid-cols-[1fr_minmax(0,36rem)_1fr] md:items-center md:gap-[26px]">
            <div className="hidden md:block" />
            <StatusCard text={status.text} />
            <div className="mt-3 flex justify-end md:mt-0 md:justify-start">{toggleAll}</div>
          </div>
          {/* Joins the banner to the top of the wire (desktop only; on a phone the wire is at the left edge). */}
          <div aria-hidden className="bg-border mx-auto hidden h-6 w-px md:block" />
        </>
      ) : (
        <div className="mb-4 flex justify-end">{toggleAll}</div>
      )}
      <ol className="relative ml-1 mt-6 space-y-6 border-l md:ml-0 md:mt-0 md:border-l-0 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:w-px md:before:bg-border">
        {onWire.map((event, index) => {
          const side = sides[index]
          switch (event.kind) {
            case 'milestone':
              return <MilestoneNote key={eventKey(event)} date={event.date} text={event.text} side={side} />
            case 'role':
              return (
                <RoleCard
                  key={eventKey(event)}
                  role={event}
                  side={side}
                  open={open[eventKey(event)]}
                  onOpenChange={(value) => setOpen((current) => ({ ...current, [eventKey(event)]: value }))}
                />
              )
          }
        })}
      </ol>
      {education && (
        <>
          {/* Joins the end of the wire to the closing card (desktop only). */}
          <div aria-hidden className="bg-border mx-auto hidden h-6 w-px md:block" />
          <div className="mt-6 md:mt-0">
            <EducationCard
              credential={education.credential}
              school={education.school}
              start={education.start}
              end={education.end}
            />
          </div>
        </>
      )}
    </div>
  )
}
