// Timing for the landing page's typed-out dossier. Lines appear one after another; the CSS (index.css) reads the
// --delay, --dur and --len variables this produces.

export const MS_PER_CHAR = 12
export const FADE_MS = 300
export const GAP_MS = 80

export type LineTiming = { delay: number; duration: number; length: number }

// `typed: false` lines (long text that would wrap) fade in instead of typing.
export function scheduleLines(lines: { text: string; typed: boolean }[]): LineTiming[] {
  let clock = 0
  return lines.map(({ text, typed }) => {
    const duration = typed ? text.length * MS_PER_CHAR : FADE_MS
    const timing = { delay: clock, duration, length: text.length }
    clock += duration + GAP_MS
    return timing
  })
}
