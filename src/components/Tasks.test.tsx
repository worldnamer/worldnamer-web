// The Tasks card. The component is rendered alone with the real queryClient and a mock token; the API is the
// in-memory taskListsHandlers unless a test answers a request itself.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, REFRESH_TOKEN, taskListsHandlers } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Tasks } from './Tasks'

function renderTasks() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Tasks />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  setAccessToken(REFRESH_TOKEN)
})

const rowList = () => screen.getByRole('list', { name: 'Task lists' })
// The list boxes in the row, by accessible name, in display order.
const rowNames = () =>
  within(rowList())
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
const box = (name: string) => within(rowList()).getByRole('button', { name })
const pressed = () =>
  within(rowList())
    .queryAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label'))

const shopping = [
  { id: 4, name: 'Shopping List' },
  { id: 2, name: 'Vertex Rim' },
  { id: 9, name: 'Chores' },
]

describe('Tasks', () => {
  it('is a region named "Tasks" with the lists in API order', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    const region = screen.getByRole('region', { name: 'Tasks' })
    expect(await within(region).findByRole('button', { name: 'Shopping List' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Shopping List', 'Vertex Rim', 'Chores'])
  })

  it('shows a loading message until the lists arrive', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    expect(screen.getByText('Loading lists...')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Chores' })
    expect(screen.queryByText('Loading lists...')).not.toBeInTheDocument()
  })

  it.each([
    ['a server error', () => new HttpResponse(null, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])('shows the load error after %s, and no row', async (_label, answer) => {
    server.use(http.get(`${API_BASE}/task_lists`, answer))
    renderTasks()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your lists. Try reloading the page.")
    expect(screen.queryByRole('list', { name: 'Task lists' })).not.toBeInTheDocument()
  })

  it('shows no list boxes and no message when there are no lists', async () => {
    server.use(...taskListsHandlers([]))
    renderTasks()

    await screen.findByRole('list', { name: 'Task lists' })
    expect(rowNames()).toEqual([])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading lists...')).not.toBeInTheDocument()
  })
})

describe('selecting a list', () => {
  it('selects the first list on load', async () => {
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    await screen.findByRole('button', { name: 'Chores' })
    expect(pressed()).toEqual(['Shopping List'])
    expect(box('Vertex Rim')).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a list when it is clicked, and only that one', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    await user.click(await screen.findByRole('button', { name: 'Vertex Rim' }))

    expect(pressed()).toEqual(['Vertex Rim'])
  })

  it('selects with the keyboard', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()

    ;(await screen.findByRole('button', { name: 'Chores' })).focus()
    await user.keyboard('{Enter}')

    expect(pressed()).toEqual(['Chores'])
  })

  it('selects the first list again after a reload, without asking the server again', async () => {
    const user = userEvent.setup()
    let gets = 0
    server.use(
      http.get(`${API_BASE}/task_lists`, () => {
        gets += 1
      }),
      ...taskListsHandlers(shopping),
    )
    const { unmount } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))
    unmount()

    renderTasks()

    expect(await screen.findByRole('button', { name: 'Chores' })).toHaveAttribute('aria-pressed', 'false')
    expect(pressed()).toEqual(['Shopping List'])
    expect(gets).toBe(1)
  })

  it('selects the first list when the selected one is gone from the next fetch', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(shopping))
    renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Chores' }))

    // Another tab deleted Chores and the first list.
    server.use(...taskListsHandlers([{ id: 2, name: 'Vertex Rim' }]))
    await queryClient.refetchQueries({ queryKey: ['task_lists'] })

    expect(await screen.findByRole('button', { name: 'Vertex Rim', pressed: true })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Vertex Rim'])
  })
})

describe('names in the row', () => {
  it('shows a blank name as an empty box, read as "Unnamed list", that can be selected', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers([{ id: 1, name: 'Chores' }, { id: 2, name: '' }]))
    renderTasks()

    const blank = await screen.findByRole('button', { name: 'Unnamed list' })
    expect(blank).toHaveTextContent(/^$/)
    expect(blank).toHaveClass('min-w-16')
    expect(blank).not.toHaveAttribute('title')

    await user.click(blank)
    expect(pressed()).toEqual(['Unnamed list'])
  })

  it('cuts a 21-character name to 20 plus "...", with the full name as tooltip and accessible name', async () => {
    const name = 'Vertex Rim Shopping L'
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    const button = await screen.findByRole('button', { name })
    expect(button).toHaveTextContent('Vertex Rim Shopping ...')
    expect(button).toHaveAttribute('title', name)
    expect(button).toHaveClass('max-w-56')
  })

  it('leaves a 20-character name whole', async () => {
    const name = 'Vertex Rim Shopping!'
    expect(name).toHaveLength(20)
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    expect((await screen.findByRole('button', { name })).textContent).toBe(name)
  })

  it('cuts a 100-character name, whatever its length, so the box stays inside its maximum width', async () => {
    const name = 'x'.repeat(100)
    server.use(...taskListsHandlers([{ id: 1, name }]))
    renderTasks()

    const button = await screen.findByRole('button', { name })
    expect(button.textContent).toBe(`${'x'.repeat(20)}...`)
    expect(button).toHaveClass('max-w-56')
  })
})

describe('scrolling the row', () => {
  // jsdom does no layout, so these tests give the row one: boxes 100px wide with 8px between them, in a scroller of a
  // chosen width. Setting scrollLeft fires a scroll event, as in a browser, and stays between 0 and the far end.
  const BOX = 100
  const STEP = 108
  let resizeCallbacks: (() => void)[] = []

  beforeEach(() => {
    resizeCallbacks = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    // On the prototype, so a list box added during the test is laid out too.
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
    vi.unstubAllGlobals()
    delete (HTMLLIElement.prototype as { offsetLeft?: number }).offsetLeft
    delete (HTMLLIElement.prototype as { offsetWidth?: number }).offsetWidth
  })

  // Gives the scroller its width and tells the row it was resized. Returns the scroller.
  function layOut(width: number) {
    const list = rowList()
    const scroller = list.parentElement!
    const scrollWidth = () => Math.max(width, list.children.length * STEP - (STEP - BOX))
    let left = 0
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, get: () => width },
      scrollWidth: { configurable: true, get: scrollWidth },
      scrollLeft: {
        configurable: true,
        get: () => left,
        set: (value: number) => {
          left = Math.max(0, Math.min(value, scrollWidth() - width))
          scroller.dispatchEvent(new Event('scroll'))
        },
      },
    })
    act(() => resizeCallbacks.forEach((callback) => callback()))
    return scroller
  }

  const lists = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `List ${i + 1}` }))
  const leftChevron = () => screen.queryByRole('button', { name: 'Scroll lists left' })
  const rightChevron = () => screen.queryByRole('button', { name: 'Scroll lists right' })

  it('shows no chevrons when every list fits', async () => {
    server.use(...taskListsHandlers(lists(3)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 3' })

    layOut(500)

    expect(leftChevron()).not.toBeInTheDocument()
    expect(rightChevron()).not.toBeInTheDocument()
  })

  it('shows only the right chevron when lists are hidden on the right, and the left one once scrolled', async () => {
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })

    const scroller = layOut(250)
    expect(rightChevron()).toBeInTheDocument()
    expect(leftChevron()).not.toBeInTheDocument()

    act(() => {
      scroller.scrollLeft = STEP
    })
    expect(leftChevron()).toBeInTheDocument()
    expect(rightChevron()).toBeInTheDocument()

    act(() => {
      scroller.scrollLeft = 10_000 // the far end
    })
    expect(leftChevron()).toBeInTheDocument()
    expect(rightChevron()).not.toBeInTheDocument()
  })

  it('pages with the chevrons: Right brings the first cut-off list to the left edge, Left shows the one before whole', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    const scroller = layOut(250)

    // Lists 1 and 2 fit in 250px; List 3 is cut off.
    await user.click(rightChevron()!)
    expect(scroller.scrollLeft).toBe(2 * STEP)

    // List 2 is now hidden on the left: the row moves back until it shows whole, starting at a box.
    await user.click(leftChevron()!)
    expect(scroller.scrollLeft).toBe(0)
  })

  it('moves focus to the other chevron when the pressed one disappears at the end', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    layOut(250)

    rightChevron()!.focus()
    await user.keyboard('{Enter}')
    expect(rightChevron()).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(rightChevron()).not.toBeInTheDocument()
    expect(leftChevron()).toHaveFocus()
  })

  it('scrolls a list into view when it is selected', async () => {
    const user = userEvent.setup()
    server.use(...taskListsHandlers(lists(5)))
    renderTasks()
    await screen.findByRole('button', { name: 'List 5' })
    const scroller = layOut(250)

    // List 4 (324 to 424) is past the right edge; the row scrolls to List 3, from which List 4 shows whole.
    await user.click(screen.getByRole('button', { name: 'List 4' }))

    expect(scroller.scrollLeft).toBe(2 * STEP)
  })
})
