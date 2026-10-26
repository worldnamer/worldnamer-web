import type { Side, TimelineEvent } from '@/data/resume'

// Decides which side of the wire each event goes on (events are newest first).
// Role cards alternate sides, starting on the left. A milestone goes on the same side as the card directly above
// it (the job moved to, so the job left falls on the other side). A milestone above every card takes the first
// card's side. An event's own `side` overrides all of this, and the next card flips from whichever side it ended on.
export function assignSides(events: TimelineEvent[]): Side[] {
  let lastCard: Side | undefined

  return events.map((event) => {
    if (event.kind === 'role') {
      lastCard = event.side ?? (lastCard === 'left' ? 'right' : 'left')
      return lastCard
    }
    return (event.kind === 'milestone' && event.side) || lastCard || 'left'
  })
}
