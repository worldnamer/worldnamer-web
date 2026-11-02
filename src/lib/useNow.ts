import { useEffect, useState } from 'react'

// The current time in epoch milliseconds, renewed every `intervalMs`. It lets a component draw what depends on the
// clock (dimming a finished event, rolling over at midnight) without asking the API again. The first value is read
// lazily, once, and there is one interval per component that calls it, cleared when the component goes away.
// The value can lag the true time by up to one interval.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
