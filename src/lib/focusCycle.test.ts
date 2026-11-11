import { expect, it } from 'vitest'
import { focusReducer, focusTitle, formatRemaining, hasEnded, initialFocusState, phaseMs, remainingMs, type FocusState } from './focusCycle'

const lengths = { work: 25, break: 5, longBreak: 20 }
const MIN = 60_000

it('gives each phase its own length from the pickers', () => {
  expect([0, 1, 5].map((p) => phaseMs(p, lengths))).toEqual([25 * MIN, 5 * MIN, 20 * MIN])
})

it('starts the first Work phase running from the pickers', () => {
  const state = focusReducer(initialFocusState, { type: 'start', now: 1000, lengths })
  expect(state).toEqual({ status: 'running', phase: 0, lengths, endsAt: 1000 + 25 * MIN })
  expect(remainingMs(state, 1000 + 10 * MIN)).toBe(15 * MIN)
})

it('holds the next phase at its full length when one runs out, and counts down only once started', () => {
  let state: FocusState = focusReducer(initialFocusState, { type: 'start', now: 0, lengths })
  expect(hasEnded(state, 25 * MIN - 1)).toBe(false)
  expect(hasEnded(state, 25 * MIN)).toBe(true)
  state = focusReducer(state, { type: 'phaseEnded' })
  expect(state).toEqual({ status: 'held', phase: 1, lengths })
  expect(remainingMs(state, 99 * MIN)).toBe(5 * MIN)
  expect(hasEnded(state, 99 * MIN)).toBe(false)
  state = focusReducer(state, { type: 'start', now: 100 * MIN, lengths })
  expect(state).toEqual({ status: 'running', phase: 1, lengths, endsAt: 105 * MIN })
})

it('walks all six sections and returns to the pickers after the last', () => {
  let state: FocusState = initialFocusState
  let clock = 0
  const seen: number[] = []
  state = focusReducer(state, { type: 'start', now: clock, lengths })
  for (let i = 0; i < 6; i++) {
    if (state.status !== 'running') throw new Error('expected running')
    seen.push(state.phase)
    clock = state.endsAt
    state = focusReducer(state, { type: 'phaseEnded' })
    if (i < 5) {
      expect(state.status).toBe('held')
      clock += MIN
      state = focusReducer(state, { type: 'start', now: clock, lengths })
    }
  }
  expect(seen).toEqual([0, 1, 2, 3, 4, 5])
  expect(state).toEqual({ status: 'idle' })
})

it('ignores actions that do not apply', () => {
  expect(focusReducer(initialFocusState, { type: 'phaseEnded' })).toBe(initialFocusState)
  const running = focusReducer(initialFocusState, { type: 'start', now: 0, lengths })
  expect(focusReducer(running, { type: 'start', now: 5, lengths })).toBe(running)
})

it('reports no time for the pickers and never a negative time', () => {
  expect(remainingMs(initialFocusState, 0)).toBe(0)
  const running = focusReducer(initialFocusState, { type: 'start', now: 0, lengths })
  expect(remainingMs(running, 999 * MIN)).toBe(0)
})

it('formats the time left as m:ss, rounded up', () => {
  expect(formatRemaining(15 * MIN)).toBe('15:00')
  expect(formatRemaining(15 * MIN - 1)).toBe('15:00')
  expect(formatRemaining(61_000)).toBe('1:01')
  expect(formatRemaining(0)).toBe('0:00')
})

const running = (now = 0): FocusState => focusReducer(initialFocusState, { type: 'start', now, lengths })

it('pauses with the time left frozen and continues with neither loss nor gain', () => {
  const paused = focusReducer(running(0), { type: 'pause', now: 10 * MIN })
  expect(paused).toEqual({ status: 'paused', phase: 0, lengths, remainingMs: 15 * MIN })
  // However long the pause lasts, the time left does not move and does not end.
  expect(remainingMs(paused, 500 * MIN)).toBe(15 * MIN)
  expect(hasEnded(paused, 500 * MIN)).toBe(false)
  const resumed = focusReducer(paused, { type: 'resume', now: 100 * MIN })
  expect(resumed).toEqual({ status: 'running', phase: 0, lengths, endsAt: 115 * MIN })
  expect(remainingMs(resumed, 100 * MIN)).toBe(15 * MIN)
})

it('skips to the next phase held at its full length from running, paused and held', () => {
  const held1 = { status: 'held', phase: 1, lengths }
  expect(focusReducer(running(), { type: 'skip' })).toEqual(held1)
  expect(focusReducer(focusReducer(running(), { type: 'pause', now: MIN }), { type: 'skip' })).toEqual(held1)
  expect(focusReducer({ status: 'held', phase: 1, lengths }, { type: 'skip' })).toEqual({ status: 'held', phase: 2, lengths })
})

it('returns to the pickers when the last section is skipped, and on stop from anywhere', () => {
  expect(focusReducer({ status: 'held', phase: 5, lengths }, { type: 'skip' })).toEqual({ status: 'idle' })
  expect(focusReducer({ status: 'running', phase: 5, lengths, endsAt: 9 }, { type: 'skip' })).toEqual({ status: 'idle' })
  expect(focusReducer(running(), { type: 'stop' })).toEqual({ status: 'idle' })
  expect(focusReducer({ status: 'held', phase: 3, lengths }, { type: 'stop' })).toEqual({ status: 'idle' })
  expect(focusReducer({ status: 'paused', phase: 2, lengths, remainingMs: 5 }, { type: 'stop' })).toEqual({ status: 'idle' })
})

it('ignores pause, resume and skip where they do not apply', () => {
  expect(focusReducer(initialFocusState, { type: 'skip' })).toBe(initialFocusState)
  expect(focusReducer(initialFocusState, { type: 'pause', now: 0 })).toBe(initialFocusState)
  const held: FocusState = { status: 'held', phase: 1, lengths }
  expect(focusReducer(held, { type: 'pause', now: 0 })).toBe(held)
  expect(focusReducer(held, { type: 'resume', now: 0 })).toBe(held)
})

it('words the tab title for each state, and gives none at the pickers', () => {
  expect(focusTitle(initialFocusState, 0)).toBeNull()
  const r = running(0)
  expect(focusTitle(r, 20 * MIN + 48_000)).toBe('4:12 · Work')
  expect(focusTitle(focusReducer(r, { type: 'pause', now: 20 * MIN + 48_000 }), 99 * MIN)).toBe('Paused · Work · 4:12')
  expect(focusTitle({ status: 'held', phase: 1, lengths }, 0)).toBe('Break, 5:00, ready')
})
