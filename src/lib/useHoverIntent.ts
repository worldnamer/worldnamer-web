import { type PointerEvent, useEffect, useRef } from 'react'

// Calls onIntent when a mouse has rested on an element for delayMs. Leaving early cancels it. Touch and pen are
// ignored (a tap is a click, and it must not also start a timer).
export function useHoverIntent(onIntent: () => void, delayMs: number, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  return {
    onPointerEnter(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.pointerType !== 'mouse') return
      clearTimeout(timer.current)
      timer.current = setTimeout(onIntent, delayMs)
    },
    onPointerLeave() {
      clearTimeout(timer.current)
    },
  }
}
