import { useRef, useState, useEffect } from 'react'

export function useDraft() {
  const plusRef = useRef<HTMLButtonElement>(null)
  const [drafting, setDrafting] = useState(false)
  const refocusPlus = useRef(false)

  // The + button is disabled while the draft is open, so focus can only go back to it after the draft has gone.
  useEffect(() => {
    if (!drafting && refocusPlus.current) {
      refocusPlus.current = false
      plusRef.current?.focus()
    }
  }, [drafting])

  // Closes the draft. Focus goes back to the + after Enter or Escape; after a click elsewhere it stays there.
  function closeDraft(refocus: boolean) {
    refocusPlus.current = refocus
    setDrafting(false)
  }

  return { drafting, setDrafting, closeDraft, plusRef }
}