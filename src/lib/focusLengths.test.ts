import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_LENGTHS, FOCUS_LENGTHS_KEY, loadFocusLengths, saveFocusLengths } from './focusLengths'

beforeEach(() => localStorage.clear())

it('gives 15, 5 and 15 when nothing is saved', () => {
  expect(loadFocusLengths()).toEqual({ work: 15, break: 5, longBreak: 15 })
})

it('restores what was saved', () => {
  saveFocusLengths({ work: 25, break: 10, longBreak: 30 })
  expect(loadFocusLengths()).toEqual({ work: 25, break: 10, longBreak: 30 })
})

it('falls back when the saved text is not JSON or not an object', () => {
  for (const text of ['{nope', 'null', '42', '"x"', '[]']) {
    localStorage.setItem(FOCUS_LENGTHS_KEY, text)
    expect(loadFocusLengths()).toEqual(DEFAULT_LENGTHS)
  }
})

it('falls back per field for values of the wrong type, off the step, or out of range', () => {
  localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: '25', break: 7, longBreak: 30 }))
  expect(loadFocusLengths()).toEqual({ work: 15, break: 5, longBreak: 30 })
  localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: 0, break: 65, longBreak: 12.5 }))
  expect(loadFocusLengths()).toEqual(DEFAULT_LENGTHS)
  localStorage.setItem(FOCUS_LENGTHS_KEY, JSON.stringify({ work: 5, break: 60 }))
  expect(loadFocusLengths()).toEqual({ work: 5, break: 60, longBreak: 15 })
})

it('uses the defaults and does not throw when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(loadFocusLengths()).toEqual(DEFAULT_LENGTHS)
  expect(() => saveFocusLengths(DEFAULT_LENGTHS)).not.toThrow()
  vi.restoreAllMocks()
})
