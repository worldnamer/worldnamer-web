import type { Side } from '@/data/resume'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { TimelineItem } from './TimelineItem'

// A moment on the wire: a date and one line, with no card around it.
export function MilestoneNote({ date, text, side }: { date: string; text: string; side: Side }) {
  return (
    <TimelineItem side={side} variant="note">
      <p className={cn('text-muted-foreground text-sm', side === 'left' && 'md:text-right')}>
        <span className="text-brand font-semibold">{formatDate(date)}</span> · {text}
      </p>
    </TimelineItem>
  )
}
