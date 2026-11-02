import { ArmchairIcon, BriefcaseIcon, CoffeeIcon, type LucideIcon } from 'lucide-react'
import { formatRemaining, PHASE_LABELS, PHASES, phaseMs, type PhaseKind } from '@/lib/focusCycle'
import type { FocusLengths } from '@/lib/focusLengths'
import { cn } from '@/lib/utils'

const ICONS: Record<PhaseKind, LucideIcon> = { work: BriefcaseIcon, break: CoffeeIcon, longBreak: ArmchairIcon }

// The six sections of the cycle in one row. The current one is a wide bar whose fill is the share of the phase still
// left, with the time centered on it. Later ones are small outlined icons and finished ones small solid icons. The
// icons are decoration; each item also carries its name and state as text for a screen reader.
export function PhaseRow({ phase, lengths, remaining, note }: { phase: number; lengths: FocusLengths; remaining: number; note?: string }) {
  return (
    <ol aria-label="Focus cycle" className="flex h-9 items-center gap-2">
      {PHASES.map((kind, index) => {
        const label = PHASE_LABELS[kind]
        const Icon = ICONS[kind]
        if (index === phase) {
          const total = phaseMs(index, lengths)
          const time = formatRemaining(remaining)
          return (
            <li key={index} aria-current="step" className="min-w-0 flex-1">
              <div
                role="progressbar"
                aria-label={`${label}, ${time} left${note ? `, ${note}` : ''}`}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={remaining}
                aria-valuetext={`${time} left`}
                className="relative h-9 overflow-hidden rounded-md border border-border"
              >
                <div className="absolute inset-y-0 left-0 bg-brand/40" style={{ width: `${(remaining / total) * 100}%` }} />
                <span className="relative flex h-full items-center justify-center gap-1.5 text-sm tabular-nums">
                  <Icon aria-hidden="true" className="size-4" />
                  {time}
                </span>
              </div>
            </li>
          )
        }
        const done = index < phase
        return (
          <li key={index} className="shrink-0">
            <Icon aria-hidden="true" className={cn('size-5', !done && 'text-muted-foreground')} fill={done ? 'currentColor' : 'none'} />
            <span className="sr-only">
              {label}, {done ? 'done' : 'coming up'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
