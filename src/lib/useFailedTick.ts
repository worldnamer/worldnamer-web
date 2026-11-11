import { useRef, useState } from 'react'
import { type FailedBox } from '@/components/HabitsDayCell'

export function useFailedTick() {
  const [failed, setFailed] = useState<FailedBox | null>(null)
  const failedInput = useRef<HTMLInputElement | null>(null)

  function recordFailure(box: FailedBox, input: HTMLInputElement | null) {
    failedInput.current = input
    setFailed(box)
  }

  function dismissFailure() {
    setFailed(null)
    // The Dismiss button is about to go, so focus moves to the box that failed, ready to try again.
    failedInput.current?.focus()
  }

  return { failed, setFailed, recordFailure, dismissFailure }
}