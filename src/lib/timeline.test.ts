import { describe, expect, it } from 'vitest'
import type { TimelineEvent } from '@/data/resume'
import { assignSides } from './timeline'

const role = (title: string, side?: 'left' | 'right'): TimelineEvent => ({
  kind: 'role',
  employer: 'Acme',
  title,
  start: '2020',
  end: '2021',
  bullets: [],
  side,
})
const milestone = (text: string): TimelineEvent => ({ kind: 'milestone', date: '2020', text })

describe('assignSides', () => {
  it('alternates cards, starting on the left', () => {
    expect(assignSides([role('a'), role('b'), role('c')])).toEqual(['left', 'right', 'left'])
  })

  it('puts a milestone on the same side as the card above it', () => {
    const events = [role('a'), milestone('joined a'), role('b'), milestone('joined b'), role('c')]

    expect(assignSides(events)).toEqual(['left', 'left', 'right', 'right', 'left'])
  })

  it('puts a milestone above every card on the first card’s side', () => {
    expect(assignSides([milestone('left the last job'), role('a'), role('b')])).toEqual(['left', 'left', 'right'])
  })

  it('lets an event pick its side, and the next card flips from it', () => {
    expect(assignSides([role('a', 'right'), role('b')])).toEqual(['right', 'left'])
  })
})
