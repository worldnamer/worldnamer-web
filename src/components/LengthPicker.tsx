import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_MINUTES, MIN_MINUTES, STEP_MINUTES } from '@/lib/focusLengths'

// One column of the focus timer's setup: a label, an up button, the minutes as plain text and a down button. The
// buttons dim (and stop working) at the ends of the range. Nothing can be typed, so there is no bad value to check.
export function LengthPicker({ label, minutes, onChange }: { label: string; minutes: number; onChange: (minutes: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm">{label}</span>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`${label} minutes up`}
        disabled={minutes >= MAX_MINUTES}
        onClick={() => onChange(minutes + STEP_MINUTES)}
      >
        <ChevronUpIcon aria-hidden="true" />
      </Button>
      <span className="tabular-nums">{minutes}</span>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`${label} minutes down`}
        disabled={minutes <= MIN_MINUTES}
        onClick={() => onChange(minutes - STEP_MINUTES)}
      >
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
