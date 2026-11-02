import { PauseIcon, PlayIcon, SkipForwardIcon, SquareIcon } from 'lucide-react'
import { useState } from 'react'
import { LengthPicker } from '@/components/LengthPicker'
import { PhaseRow } from '@/components/PhaseRow'
import { Button } from '@/components/ui/button'
import { loadFocusLengths, saveFocusLengths, type FocusLengths } from '@/lib/focusLengths'
import { focusTitle } from '@/lib/focusCycle'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useFocusTimer } from '@/lib/useFocusTimer'

// Said after the time in the bar's name, for a screen reader.
const NOTES: Record<string, string | undefined> = { held: 'ready to start', paused: 'paused' }

// All the controls rest as quiet outlines and light up in the brand color under the pointer, a darker shade while
// pressed. Hover only applies where the input can hover, so a tap on a phone does not leave a button stuck lit. The
// important marks beat the outline variant's own hover color, whatever order the generated rules come in.
const CONTROL =
  'can-hover:hover:border-primary! can-hover:hover:bg-primary! can-hover:hover:text-primary-foreground! active:border-primary/70! active:bg-primary/70! active:text-primary-foreground!'

// The focus timer card: the three length pickers while idle, and the six-section row while a cycle runs. The body and
// the controls row have fixed heights so the card keeps its size when it switches between the two.
// The state lives here and nowhere else: nothing about a running timer is saved or shared, so there is no server state.
export function FocusTimerCard() {
  // Read from storage once, on the first render.
  const [lengths, setLengths] = useState<FocusLengths>(loadFocusLengths)
  const { state, now, remaining, start, pause, resume, skip, stop } = useFocusTimer(lengths)

  useDocumentTitle(focusTitle(state, now))

  function change(key: keyof FocusLengths, minutes: number) {
    const next = { ...lengths, [key]: minutes }
    setLengths(next)
    saveFocusLengths(next)
  }

  return (
    <section aria-labelledby="focus-timer-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="focus-timer-heading" className="font-display text-xl tracking-wide">
          Focus timer
        </h2>
      </div>
      <div className="grid h-42 grid-rows-[1fr_auto] border-b border-border py-2">
        <div className="flex items-center justify-center">
          {state.status === 'idle' ? (
            <div className="flex w-full justify-around">
              <LengthPicker label="Work" minutes={lengths.work} onChange={(m) => change('work', m)} />
              <LengthPicker label="Break" minutes={lengths.break} onChange={(m) => change('break', m)} />
              <LengthPicker label="Long break" minutes={lengths.longBreak} onChange={(m) => change('longBreak', m)} />
            </div>
          ) : (
            <div className="w-full">
              <PhaseRow phase={state.phase} lengths={state.lengths} remaining={remaining} note={NOTES[state.status]} />
            </div>
          )}
        </div>
        <div className="grid h-8 grid-cols-[1fr_2fr_1fr] items-center gap-2">
          {state.status !== 'idle' ? (
            <Button size="sm" variant="outline" className={CONTROL} onClick={stop}>
              <SquareIcon aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <span />
          )}
          {(state.status === 'idle' || state.status === 'held') && (
            <Button size="sm" variant="outline" className={CONTROL} onClick={start}>
              <PlayIcon aria-hidden="true" />
              Start
            </Button>
          )}
          {state.status === 'running' && (
            <Button size="sm" variant="outline" className={CONTROL} onClick={pause}>
              <PauseIcon aria-hidden="true" />
              Pause
            </Button>
          )}
          {state.status === 'paused' && (
            <Button size="sm" variant="outline" className={CONTROL} onClick={resume}>
              <PlayIcon aria-hidden="true" />
              Continue
            </Button>
          )}
          {state.status !== 'idle' ? (
            <Button size="sm" variant="outline" className={CONTROL} onClick={skip}>
              <SkipForwardIcon aria-hidden="true" />
              Skip
            </Button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </section>
  )
}
