// INTERFACE (web-1), file: src/auth/tokenStore.ts
//   The access token lives in a module-level variable only (never React state, localStorage or sessionStorage).
//   export function getAccessToken(): string | null      // null when there is no token
//   export function setAccessToken(token: string): void
//   export function clearAccessToken(): void
//
// INTERFACE (web-1), file: src/auth/sessionFlag.ts
//   The non-secret hint "a session probably exists", kept in localStorage under the key below with the value "1".
//   export const HAS_SESSION_KEY = 'worldnamer.hasSession'
//   export function hasSessionFlag(): boolean
//   export function setSessionFlag(): void     // localStorage[HAS_SESSION_KEY] = '1'
//   export function clearSessionFlag(): void   // removes the key
import { beforeEach, describe, expect, it } from 'vitest'
import { HAS_SESSION_KEY, clearSessionFlag, hasSessionFlag, setSessionFlag } from './sessionFlag'
import { clearAccessToken, getAccessToken, setAccessToken } from './tokenStore'

beforeEach(() => {
  clearAccessToken()
  localStorage.clear()
  sessionStorage.clear()
})

describe('tokenStore', () => {
  it('starts empty, then holds the token that was set', () => {
    expect(getAccessToken()).toBeNull()
    setAccessToken('abc')
    expect(getAccessToken()).toBe('abc')
  })

  it('forgets the token when cleared', () => {
    setAccessToken('abc')
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })

  it('never writes the token to localStorage or sessionStorage', () => {
    setAccessToken('secret-token-value')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})

describe('sessionFlag', () => {
  it('uses the documented key', () => {
    expect(HAS_SESSION_KEY).toBe('worldnamer.hasSession')
  })

  it('is false until set, "1" in localStorage when set, and false again when cleared', () => {
    expect(hasSessionFlag()).toBe(false)
    setSessionFlag()
    expect(hasSessionFlag()).toBe(true)
    expect(localStorage.getItem('worldnamer.hasSession')).toBe('1')
    clearSessionFlag()
    expect(hasSessionFlag()).toBe(false)
    expect(localStorage.getItem('worldnamer.hasSession')).toBeNull()
  })
})
