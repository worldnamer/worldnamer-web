// INTERFACE (web-1), file: src/auth/errors.ts
//   export function loginErrorMessage(status: number | null): string
//     status is the HTTP status of a failed login, or null when there was no response (network error).
//     401 -> 'Invalid username or password.'
//     429 -> 'Too many attempts. Try again in a few minutes.'
//     anything else (500, 503, 400, null, ...) -> 'Something went wrong. Try again.'
import { describe, expect, it } from 'vitest'
import { loginErrorMessage } from './errors'

describe('loginErrorMessage', () => {
  it('maps wrong credentials', () => {
    expect(loginErrorMessage(401)).toBe('Invalid username or password.')
  })

  it('maps a throttled attempt', () => {
    expect(loginErrorMessage(429)).toBe('Too many attempts. Try again in a few minutes.')
  })

  it.each([500, 502, 503, 400, 403, null])('maps %s to the generic message', (status) => {
    expect(loginErrorMessage(status)).toBe('Something went wrong. Try again.')
  })
})
