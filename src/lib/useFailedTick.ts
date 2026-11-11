import { useRef, useState } from 'react'

// A box that failed to save: which habit and day, for the message and the cell's outline.
export type FailedBox = { habitId: number; name: string; date: string }

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