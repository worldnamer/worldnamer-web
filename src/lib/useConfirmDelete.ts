import { useRef, useState } from 'react'

export function useConfirmDelete<T>(focusAfterConfirm: () => HTMLElement | null) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<T | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  function ask(item: T, button: HTMLElement) {
    opener.current = button
    setTarget(item)
    setOpen(true)
  }

  function focusAfterClose(confirmed: boolean) {
    return confirmed ? focusAfterConfirm() : opener.current
  }

  return { open, setOpen, target, ask, focusAfterClose }
}