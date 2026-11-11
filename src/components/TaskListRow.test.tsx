// Tests for the row of task lists: the fades at its edges that show more lists lie past them, and dragging the row
// sideways with the mouse. jsdom does no layout, so each test lays the boxes out by hand.
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('shows no fade when every list fits', () => {
    const { container } = renderRow(lists(3))
    layOut(400)

    expect(container.querySelector('[data-fade="start"]')).toBeNull()
    expect(container.querySelector('[data-fade="end"]')).toBeNull()
  })

  it('shows the end fade when more lists lie past the right edge', () => {
    const { container } = renderRow(lists(5))
    const scroller = layOut(250)
    fireEvent.scroll(scroller)

    expect(container.querySelector('[data-fade="end"]')).not.toBeNull()
    expect(container.querySelector('[data-fade="start"]')).toBeNull()
  })

  it('shows both fades part-way along', () => {
    const { container } = renderRow(lists(5))
    const scroller = layOut(250)
    act(() => {
      scroller.scrollLeft = 100
    })

    expect(container.querySelector('[data-fade="start"]')).not.toBeNull()
    expect(container.querySelector('[data-fade="end"]')).not.toBeNull()
  })

  it('shows only the start fade at the far end', () => {
    const { container } = renderRow(lists(5))
    const scroller = layOut(250)
    act(() => {
      scroller.scrollLeft = scroller.scrollWidth
    })

    expect(container.querySelector('[data-fade="start"]')).not.toBeNull()
    expect(container.querySelector('[data-fade="end"]')).toBeNull()
  })

  it('updates the fades when lists are added or the window is resized', () => {
    const { container, rerender } = renderRow(lists(3))
    const scroller = layOut(400)

    expect(container.querySelector('[data-fade="start"]')).toBeNull()
    expect(container.querySelector('[data-fade="end"]')).toBeNull()

    rerender(<TaskListRow lists={lists(8)} selectedId={null} onSelect={() => {}} onAdd={async () => null} />)

    expect(container.querySelector('[data-fade="end"]')).not.toBeNull()

    // Widen the viewport so the eight lists fit. Only a resize event tells the row, since nothing scrolls.
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => 1000 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(container.querySelector('[data-fade="end"]')).toBeNull()
  })

  it('keeps the fades out of the way', () => {
    const { container } = renderRow(lists(5))
    const scroller = layOut(250)
    act(() => {
      scroller.scrollLeft = 100
    })

    const fades = [container.querySelector('[data-fade="start"]'), container.querySelector('[data-fade="end"]')]
    for (const fade of fades) {
      expect(fade).not.toBeNull()
      expect(fade?.getAttribute('aria-hidden')).toBe('true')
      expect(fade?.classList.contains('pointer-events-none')).toBe(true)
    }

    // The + sits beside the scrolling area, not inside it, so the fades never cover it.
    const addButton = screen.getByRole('button', { name: 'Add list' })
    const area = scroller.parentElement!
    expect(area.contains(addButton)).toBe(false)
    expect(area.nextElementSibling).toBe(addButton)
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
