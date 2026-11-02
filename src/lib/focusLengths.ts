// The three lengths of the focus timer, in minutes, kept in localStorage so they survive a reload. They are a
// preference of this browser only; nothing is sent anywhere.
export type FocusLengths = { work: number; break: number; longBreak: number }

export const FOCUS_LENGTHS_KEY = 'worldnamer.focusLengths'
export const MIN_MINUTES = 5
export const MAX_MINUTES = 60
export const STEP_MINUTES = 5
export const DEFAULT_LENGTHS: FocusLengths = { work: 15, break: 5, longBreak: 15 }

function isValidMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_MINUTES &&
    value <= MAX_MINUTES &&
    value % STEP_MINUTES === 0
  )
}

// Reads the saved lengths. Anything missing, unparseable or out of range falls back to the default, field by field, so
// one bad value does not throw away the other two. Storage can throw (a private window, storage switched off), and
// that also means the defaults.
export function loadFocusLengths(): FocusLengths {
  let saved: unknown
  try {
    const text = localStorage.getItem(FOCUS_LENGTHS_KEY)
    saved = text === null ? null : JSON.parse(text)
  } catch {
    return { ...DEFAULT_LENGTHS }
  }
  const record = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
  const pick = (key: keyof FocusLengths) => (isValidMinutes(record[key]) ? record[key] : DEFAULT_LENGTHS[key])
  return { work: pick('work'), break: pick('break'), longBreak: pick('longBreak') }
}

// Saves the lengths. A failure is ignored: the timer still works, it just forgets the lengths on reload.
export function saveFocusLengths(lengths: FocusLengths): void {
  try {
    localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify(lengths))
  } catch {
    // Nothing to do: the lengths stay in memory for this visit.
  }
}
