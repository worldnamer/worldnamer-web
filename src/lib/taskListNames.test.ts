import { describe, expect, it } from 'vitest'
import { accessibleListName, isBlank, rowName } from './taskListNames'

describe('rowName', () => {
  it('leaves a 20-character name alone', () => {
    expect(rowName('a'.repeat(20))).toBe('a'.repeat(20))
  })

  it('cuts a 21-character name to 20 and appends "..."', () => {
    expect(rowName('Vertex Rim Shopping L')).toBe('Vertex Rim Shopping ...')
  })

  it('counts characters outside the Basic Multilingual Plane as one and never splits them', () => {
    const name = '🛒'.repeat(21)
    expect(rowName(name)).toBe(`${'🛒'.repeat(20)}...`)
    expect(rowName('🛒'.repeat(20))).toBe('🛒'.repeat(20))
  })
})

describe('accessibleListName', () => {
  it('is the full name, however long', () => {
    expect(accessibleListName('x'.repeat(100))).toBe('x'.repeat(100))
  })

  it.each(['', '   '])('is "Unnamed list" for the blank name %j', (name) => {
    expect(isBlank(name)).toBe(true)
    expect(accessibleListName(name)).toBe('Unnamed list')
  })
})
