import { useState } from 'react'
import { LengthPicker } from '@/components/LengthPicker'
import { PhaseRow } from '@/components/PhaseRow'
import { Button } from '@/components/ui/button'
import { loadFocusLengths, saveFocusLengths, type FocusLengths } from '@/lib/focusLengths'
import { useFocusTimer } from '@/lib/useFocusTimer'

// The focus timer card: the three length pickers while idle, and the six-section row while a cycle runs. The body and
// the controls row have fixed heights so the card keeps its size when it switches between the two.
// The state lives here and nowhere else: nothing about a running timer is saved or shared, so there is no server state.
export function FocusTimerCard() {
  // Read from storage once, on the first render.
  const [lengths, setLengths] = useState<FocusLengths>(loadFocusLengths)
  const { state, remaining, start } = useFocusTimer(lengths)

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
      <div className="grid h-48 grid-rows-[1fr_auto] border-b border-border py-2">
        <div className="flex items-center justify-center">
          {state.status === 'idle' ? (
            <div className="flex w-full justify-around">
              <LengthPicker label="Work" minutes={lengths.work} onChange={(m) => change('work', m)} />
              <LengthPicker label="Break" minutes={lengths.break} onChange={(m) => change('break', m)} />
              <LengthPicker label="Long break" minutes={lengths.longBreak} onChange={(m) => change('longBreak', m)} />
            </div>
          ) : (
            <div className="w-full">
              <PhaseRow phase={state.phase} lengths={state.lengths} remaining={remaining} held={state.status === 'held'} />
            </div>
          )}
        </div>
        <div className="flex h-8 items-center justify-center gap-2">
          {(state.status === 'idle' || state.status === 'held') && (
            <Button size="sm" onClick={start}>
              Start
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
