import { useCallback, useEffect, useReducer, useState } from 'react'
import { focusReducer, hasEnded, initialFocusState, remainingMs } from '@/lib/focusCycle'
import type { FocusLengths } from '@/lib/focusLengths'

// How often the clock is read again while a phase runs. Only the card re-renders on it, and only while running.
export const TICK_MS = 250

// Owns the focus timer: the cycle state, one interval while a phase runs, and the time left at the latest tick.
// The interval only re-reads the clock; the time shown comes from the stored end time, so it is right even if the
// browser delays the ticks of a background tab.
export function useFocusTimer(lengths: FocusLengths) {
  const [state, dispatch] = useReducer(focusReducer, initialFocusState)
  const [now, setNow] = useState(Date.now)

  const start = useCallback(() => {
    const t = Date.now()
    setNow(t)
    dispatch({ type: 'start', now: t, lengths })
  }, [lengths])

  const running = state.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (hasEnded(state, t)) dispatch({ type: 'phaseEnded' })
    }, TICK_MS)
    // Cleared whenever the phase changes or stops running, and when the card goes away.
    return () => clearInterval(id)
  }, [running, state])

  return { state, remaining: remainingMs(state, now), start }
}
