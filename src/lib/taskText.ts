// How a task's text is named. The API strips surrounding spaces, so blank text arrives as "", but the check trims
// anyway in case it does not.

export function isBlankText(text: string) {
  return text.trim() === ''
}

// The name a screen reader hears for a task: its text, or "Unnamed task" when the text is blank.
export function taskName(text: string) {
  return isBlankText(text) ? 'Unnamed task' : text
}
