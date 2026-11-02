import { useState } from 'react'
import { LengthPicker } from '@/components/LengthPicker'
import { loadFocusLengths, saveFocusLengths, type FocusLengths } from '@/lib/focusLengths'

// The focus timer card. For now it shows the three length pickers; every change is saved at once so it survives a reload.
// The body has a fixed height so the card does not change size when it later shows the running row instead.
export function FocusTimerCard() {
  // Read from storage once, on the first render.
  const [lengths, setLengths] = useState<FocusLengths>(loadFocusLengths)

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
      <div className="h-40 border-b border-border py-2">
        <div className="flex justify-around">
          <LengthPicker label="Work" minutes={lengths.work} onChange={(m) => change('work', m)} />
          <LengthPicker label="Break" minutes={lengths.break} onChange={(m) => change('break', m)} />
          <LengthPicker label="Long break" minutes={lengths.longBreak} onChange={(m) => change('longBreak', m)} />
        </div>
      </div>
    </section>
  )
}
