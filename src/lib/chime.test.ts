import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The module keeps its audio context between calls, so each test loads a fresh copy.
const created: FakeContext[] = []
class FakeContext {
  state = 'running'
  currentTime = 10
  destination = {}
  started: number[] = []
  resume = vi.fn(() => Promise.resolve())
  constructor() {
    created.push(this)
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  }
  createOscillator() {
    return { type: '', frequency: { value: 0 }, connect: vi.fn(), start: (at: number) => this.started.push(at), stop: vi.fn() }
  }
}

beforeEach(() => {
  created.length = 0
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

it('plays two tones on the context made when it was prepared, and reuses that context', async () => {
  vi.stubGlobal('AudioContext', FakeContext)
  const { prepareChime, playChime } = await import('./chime')
  prepareChime()
  prepareChime()
  playChime()
  playChime()
  expect(created).toHaveLength(1)
  expect(created[0].started).toEqual([10, 10.2, 10, 10.2])
})

it('resumes a suspended context', async () => {
  vi.stubGlobal('AudioContext', FakeContext)
  const { prepareChime } = await import('./chime')
  prepareChime()
  created[0].state = 'suspended'
  prepareChime()
  expect(created[0].resume).toHaveBeenCalledOnce()
})

it('is silent and does not throw when it was never prepared, or Web Audio is missing or throws', async () => {
  vi.stubGlobal('AudioContext', FakeContext)
  const fresh = await import('./chime')
  expect(() => fresh.playChime()).not.toThrow()
  expect(created).toHaveLength(0)

  vi.resetModules()
  vi.stubGlobal('AudioContext', undefined)
  const missing = await import('./chime')
  expect(() => missing.prepareChime()).not.toThrow()
  expect(() => missing.playChime()).not.toThrow()

  vi.resetModules()
  vi.stubGlobal('AudioContext', function Throwing() {
    throw new Error('blocked')
  })
  const throwing = await import('./chime')
  expect(() => throwing.prepareChime()).not.toThrow()
  expect(() => throwing.playChime()).not.toThrow()
})
