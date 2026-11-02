import { useCallback, useEffect, useReducer, useState } from 'react'
import { playChime, prepareChime } from '@/lib/chime'
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
    // Inside the click, because browsers only allow sound that a click has unlocked.
    prepareChime()
    const t = Date.now()
    setNow(t)
    dispatch({ type: 'start', now: t, lengths })
  }, [lengths])

  const pause = useCallback(() => {
    const t = Date.now()
    setNow(t)
    dispatch({ type: 'pause', now: t })
  }, [])
  const resume = useCallback(() => {
    prepareChime()
    const t = Date.now()
    setNow(t)
    dispatch({ type: 'resume', now: t })
  }, [])
  const skip = useCallback(() => dispatch({ type: 'skip' }), [])
  const stop = useCallback(() => dispatch({ type: 'stop' }), [])

  const running = state.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      // The chime is for a phase that ran out, so Skip and Stop (which never get here) stay silent.
      if (hasEnded(state, t)) {
        playChime()
        dispatch({ type: 'phaseEnded' })
      }
    }, TICK_MS)
    // Cleared on pause, hold, stop and skip (the state stops running), when the phase changes, and when the card goes away.
    return () => clearInterval(id)
  }, [running, state])

  return { state, now, remaining: remainingMs(state, now), start, pause, resume, skip, stop }
}
