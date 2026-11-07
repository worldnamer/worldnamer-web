import { expect, it } from 'vitest'
import { formatMinutes } from './duration'

it.each([
  [1, '1 min'],
  [20, '20 min'],
  [59, '59 min'],
  [60, '1 hr'],
  [80, '1 hr 20 min'],
  [125, '2 hr 5 min'],
  [120, '2 hr'],
])('formats %i minutes as %s', (minutes, text) => {
  expect(formatMinutes(minutes)).toBe(text)
})
