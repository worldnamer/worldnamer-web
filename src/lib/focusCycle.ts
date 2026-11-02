import type { FocusLengths } from '@/lib/focusLengths'

// The logic of the focus timer, with no React and no clock of its own: every function that needs the time is handed it
// (epoch milliseconds). That keeps it testable with plain numbers, and it is why a throttled background tab stays
// right: the screen only ever asks "how long is left at this moment?", and the answer comes from a stored end time,
// never from counting ticks.

export type PhaseKind = 'work' | 'break' | 'longBreak'

// The fixed cycle: three Work rounds, with a Break after the first two and a Long break after the third.
export const PHASES: readonly PhaseKind[] = ['work', 'break', 'work', 'break', 'work', 'longBreak']

export const PHASE_LABELS: Record<PhaseKind, string> = { work: 'Work', break: 'Break', longBreak: 'Long break' }

// idle: showing the pickers. held: a phase waiting at its full length until it is started. running: counting down
// to `endsAt`. The lengths used are copied into the state when the cycle starts.
export type FocusState =
  | { status: 'idle' }
  | { status: 'held'; phase: number; lengths: FocusLengths }
  | { status: 'running'; phase: number; lengths: FocusLengths; endsAt: number }

export type FocusAction =
  // Starts the cycle from the pickers, or starts the held phase. Needs the lengths for the first case.
  | { type: 'start'; now: number; lengths: FocusLengths }
  // The running phase has run out: move to the next one, held, or back to the pickers after the last.
  | { type: 'phaseEnded' }

export const initialFocusState: FocusState = { status: 'idle' }

export function phaseMs(phase: number, lengths: FocusLengths): number {
  return lengths[PHASES[phase]] * 60_000
}

// Milliseconds left in the current phase at `now`. A held phase has its full length; idle has none.
export function remainingMs(state: FocusState, now: number): number {
  switch (state.status) {
    case 'idle':
      return 0
    case 'held':
      return phaseMs(state.phase, state.lengths)
    case 'running':
      return Math.max(0, state.endsAt - now)
  }
}

// True when a running phase has run out at `now`.
export function hasEnded(state: FocusState, now: number): boolean {
  return state.status === 'running' && now >= state.endsAt
}

function afterPhase(phase: number, lengths: FocusLengths): FocusState {
  const next = phase + 1
  return next >= PHASES.length ? initialFocusState : { status: 'held', phase: next, lengths }
}

export function focusReducer(state: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case 'start':
      if (state.status === 'idle') {
        return { status: 'running', phase: 0, lengths: action.lengths, endsAt: action.now + phaseMs(0, action.lengths) }
      }
      if (state.status === 'held') {
        return { ...state, status: 'running', endsAt: action.now + phaseMs(state.phase, state.lengths) }
      }
      return state
    case 'phaseEnded':
      return state.status === 'running' ? afterPhase(state.phase, state.lengths) : state
  }
}

// Minutes and seconds, rounded up so the bar reads 15:00 at the start and 0:00 only at the very end.
export function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
