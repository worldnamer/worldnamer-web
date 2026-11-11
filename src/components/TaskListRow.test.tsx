// Tests for dragging the row of task lists sideways with the mouse. jsdom does no layout, so each test lays the boxes out by hand.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TaskListRow } from './TaskListRow'

// Each box is 100px wide and boxes are 8px apart.
const BOX = 100
const STEP = 108

const lists = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `List ${i + 1}` }))

const rowList = () => screen.getByRole('list', { name: 'Task lists' })

function renderRow(items: ReturnType<typeof lists>, onSelect: (id: number) => void = () => {}) {
  return render(
    <TaskListRow lists={items} selectedId={null} onSelect={onSelect} onAdd={async () => null} />,
  )
}

// Gives the scroller a visible width and a scroll range that matches the boxes, and makes scrollLeft behave like a
// browser's: it clamps to the range and fires a scroll event. Returns the scroller.
function layOut(width: number) {
  const list = rowList()
  const scroller = list.parentElement!
  // The content width follows the boxes currently in the list, so a rerender with more lists changes it.
  const scrollRange = () => Math.max(width, list.children.length * STEP - (STEP - BOX))
  let left = 0
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, get: () => width },
    scrollWidth: { configurable: true, get: scrollRange },
    scrollLeft: {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = Math.min(Math.max(0, value), scrollRange() - width)
        scroller.dispatchEvent(new Event('scroll'))
      },
    },
  })
  return scroller
}

describe('the lists row', () => {
  beforeEach(() => {
    Object.defineProperties(HTMLLIElement.prototype, {
      offsetLeft: {
        configurable: true,
        get(this: HTMLLIElement) {
          return Array.from(this.parentElement?.children ?? []).indexOf(this) * STEP
        },
      },
      offsetWidth: { configurable: true, get: () => BOX },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLLIElement.prototype, 'offsetLeft')
    Reflect.deleteProperty(HTMLLIElement.prototype, 'offsetWidth')
  })

  it('scrolls the row with a mouse drag', () => {
    renderRow(lists(5))
    const scroller = layOut(250)
    Object.assign(scroller, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })

    fireEvent.pointerDown(scroller, { clientX: 200, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(scroller, { clientX: 150, pointerType: 'mouse' })

    expect(scroller.scrollLeft).toBe(50)
  })

  it('leaves touch and pen pointers to the browser', () => {
    renderRow(lists(5))
    const scroller = layOut(250)
    Object.assign(scroller, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })

    for (const pointerType of ['touch', 'pen']) {
      fireEvent.pointerDown(scroller, { clientX: 200, pointerType, button: 0 })
      fireEvent.pointerMove(scroller, { clientX: 150, pointerType })

      expect(scroller.scrollLeft).toBe(0)
    }
  })

  it('still selects a list when the press barely moves', () => {
    const onSelect = vi.fn()
    renderRow(lists(5), onSelect)
    const scroller = layOut(250)
    Object.assign(scroller, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })

    fireEvent.pointerDown(scroller, { clientX: 200, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(scroller, { clientX: 198, pointerType: 'mouse' })
    fireEvent.pointerUp(scroller, { clientX: 198, pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'List 2' }))

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('does not select a list after a drag', () => {
    const onSelect = vi.fn()
    renderRow(lists(5), onSelect)
    const scroller = layOut(250)
    Object.assign(scroller, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })

    fireEvent.pointerDown(scroller, { clientX: 200, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(scroller, { clientX: 170, pointerType: 'mouse' })
    fireEvent.pointerUp(scroller, { clientX: 170, pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'List 2' }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('stops dragging on release and starts clean on the next press', () => {
    const onSelect = vi.fn()
    renderRow(lists(5), onSelect)
    const scroller = layOut(250)
    Object.assign(scroller, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })

    fireEvent.pointerDown(scroller, { clientX: 200, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(scroller, { clientX: 170, pointerType: 'mouse' })
    fireEvent.pointerUp(scroller, { clientX: 170, pointerType: 'mouse' })
    const afterRelease = scroller.scrollLeft

    fireEvent.pointerMove(scroller, { clientX: 100, pointerType: 'mouse' })
    expect(scroller.scrollLeft).toBe(afterRelease)

    fireEvent.pointerDown(scroller, { clientX: 200, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(scroller, { clientX: 199, pointerType: 'mouse' })
    fireEvent.pointerUp(scroller, { clientX: 199, pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'List 3' }))

    expect(onSelect).toHaveBeenCalledWith(3)
  })
})
