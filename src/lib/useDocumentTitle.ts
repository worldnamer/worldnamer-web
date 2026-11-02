import { useEffect, useRef } from 'react'

// Sets the tab title while `title` is a string and puts the original back when it becomes null and when the component
// goes away. The original is saved the first time a title is set. The title is only written when the string changes,
// because the effect depends on it, so a timer that re-renders often does not rewrite it on every tick.
export function useDocumentTitle(title: string | null): void {
  const original = useRef<string | null>(null)

  useEffect(() => {
    if (title !== null) {
      if (original.current === null) original.current = document.title
      document.title = title
    } else if (original.current !== null) {
      document.title = original.current
      original.current = null
    }
  }, [title])

  useEffect(
    () => () => {
      if (original.current !== null) document.title = original.current
    },
    [],
  )
}
