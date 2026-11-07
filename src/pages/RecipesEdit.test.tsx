import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import type { Recipe } from '@/api/recipes'
import { setSessionFlag } from '@/auth/sessionFlag'
import { clearAccessToken } from '@/auth/tokenStore'
import { queryClient } from '@/lib/queryClient'
import { API_BASE, errorBody, recipesHandlers, refreshHandler, type MockRecipe } from '@/mocks/handlers'
import { server } from '@/mocks/server'

beforeEach(() => {
  queryClient.clear()
  clearAccessToken()
  localStorage.clear()
})

function renderApp(route: string) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

type Proceed = () => Promise<Response | undefined>

// The recipes handlers with a log of what the page asked for. onPatch(n, proceed) can hold or fail the nth PATCH (0 based);
// proceed() runs the real mock. onGet works the same for GET /recipes/:id.
function mockRecipes(
  initial: MockRecipe[],
  hooks: {
    onPatch?: (n: number, proceed: Proceed) => Promise<Response | undefined> | Response
    onGet?: (id: string, n: number, proceed: Proceed) => Promise<Response | undefined> | Response
  } = {},
) {
  const [list, show, create, update] = recipesHandlers(initial)
  const log = { patches: [] as { id: string; body: { recipe: Record<string, unknown> } }[], gets: {} as Record<string, number>, listGets: 0 }
  server.use(
    refreshHandler,
    http.get(`${API_BASE}/recipes`, async (info) => {
      log.listGets++
      return (await list.run(info))?.response
    }),
    http.get(`${API_BASE}/recipes/:id`, async (info) => {
      const id = String(info.params.id)
      const n = log.gets[id] ?? 0
      log.gets[id] = n + 1
      const proceed = () => show.run(info).then((r) => r?.response)
      return hooks.onGet ? hooks.onGet(id, n, proceed) : proceed()
    }),
    http.post(`${API_BASE}/recipes`, async (info) => (await create.run(info))?.response),
    http.patch(`${API_BASE}/recipes/:id`, async (info) => {
      const n = log.patches.length
      log.patches.push({ id: String(info.params.id), body: (await info.request.clone().json()) as { recipe: Record<string, unknown> } })
      const proceed = () => update.run(info).then((r) => r?.response)
      return hooks.onPatch ? hooks.onPatch(n, proceed) : proceed()
    }),
  )
  return log
}

function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { opened, open }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

const bread = { id: 1, title: 'Bread', prep_instructions: 'Mix.' }
const chili = { id: 2, title: 'Chili' }

// A closed field is a button; clicking it opens its box.
const OPENER: Record<string, string> = {
  'Recipe title': 'Edit recipe title',
  'Prep instructions': 'Edit prep instructions',
  'Cooking instructions': 'Edit cooking instructions',
  'Prep minutes': 'Edit prep minutes',
  'Cook minutes': 'Edit cook minutes',
}

async function openBox(name: string) {
  await userEvent.click(await screen.findByTitle(OPENER[name]))
  return screen.findByRole('textbox', { name })
}

const titleBox = () => openBox('Recipe title')

// The title as formatted text: its box is closed and the heading holds the saved title.
async function expectTitleText(text: string) {
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Recipe title' })).not.toBeInTheDocument())
  expect(screen.getByRole('heading', { name: text })).toBeInTheDocument()
}

async function retitle(text: string) {
  const box = await titleBox()
  await userEvent.clear(box)
  await userEvent.type(box, text)
  await userEvent.tab()
}

describe('saving the title on blur', () => {
  it('sends one PATCH with only the title, as the id in the address, and updates the heading and the rolodex order', async () => {
    setSessionFlag()
    const log = mockRecipes([bread, chili])
    renderApp('/recipes/1')
    await retitle('Zucchini bread')

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Zucchini bread' })).toBeInTheDocument())
    expect(log.patches).toEqual([{ id: '1', body: { recipe: { title: 'Zucchini bread' } } }])
    const rolodex = screen.getByRole('region', { name: 'Recipes' })
    await waitFor(() =>
      expect(within(rolodex).getAllByRole('link').map((l) => l.textContent)).toEqual(['Chili', 'Zucchini bread']),
    )
  })

  it('sends nothing when the text is unchanged, even with stray spaces', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const box = await titleBox()
    await userEvent.type(box, '  ')
    await userEvent.tab()
    await settle()

    expect(log.patches).toEqual([])
    await expectTitleText('Bread')
  })

  it('puts the saved title back and sends nothing when the title is blanked', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const box = await titleBox()
    await userEvent.clear(box)
    await userEvent.type(box, '   ')
    await userEvent.tab()
    await settle()

    expect(log.patches).toEqual([])
    await expectTitleText('Bread')
  })

  it('shows the API message on a 422, returns to the saved title and leaves the cache alone', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const box = await titleBox()
    fireEvent.change(box, { target: { value: 'x'.repeat(101) } }) // fireEvent ignores maxLength
    await userEvent.click(box)
    await userEvent.tab()

    const message = await screen.findByText('Title is too long (maximum is 100 characters).')
    expect(message.closest('[role="alert"]')).toHaveClass('text-destructive')
    await expectTitleText('Bread')
    expect(log.patches).toHaveLength(1)
    expect((queryClient.getQueryData(['recipes', '1']) as Recipe).title).toBe('Bread')
  })

  it('clears a message when the box is next edited', async () => {
    setSessionFlag()
    mockRecipes([bread])
    renderApp('/recipes/1')
    const box = await titleBox()
    fireEvent.change(box, { target: { value: 'x'.repeat(101) } })
    await userEvent.click(box)
    await userEvent.tab()
    await screen.findByText(/Title is too long/)

    await userEvent.type(await titleBox(), 'a')
    expect(screen.queryByText(/Title is too long/)).not.toBeInTheDocument()
  })

  it('shows a fixed line on a 500, keeps what was typed, and retries on the next blur', async () => {
    setSessionFlag()
    const log = mockRecipes([bread], {
      onPatch: (n, proceed) =>
        n === 0
          ? HttpResponse.json(errorBody('boom', 'secret server text'), { status: 500 })
          : proceed(),
    })
    renderApp('/recipes/1')
    await retitle('Rye')

    const alert = await screen.findByText('Could not save. Try again.')
    expect(alert.closest('[role="alert"]')).toHaveClass('text-destructive')
    expect(screen.queryByText(/secret server text/)).not.toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Recipe title' })
    expect(box).toHaveValue('Rye')

    await userEvent.click(box)
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByText('Could not save. Try again.')).not.toBeInTheDocument())
    expect(log.patches).toHaveLength(2)
    expect(await screen.findByRole('heading', { name: 'Rye' })).toBeInTheDocument()
  })

  it('shows the fixed line on a network error', async () => {
    setSessionFlag()
    mockRecipes([bread], { onPatch: () => HttpResponse.error() })
    renderApp('/recipes/1')
    await retitle('Rye')

    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Recipe title' })).toHaveValue('Rye')
  })

  it('goes back to /recipes on a 404 and drops the card', async () => {
    setSessionFlag()
    mockRecipes([bread, chili], {
      onPatch: () => HttpResponse.json(errorBody('not_found', 'Not found.'), { status: 404 }),
    })
    renderApp('/recipes/1')
    await retitle('Rye')

    expect(await screen.findByText('Pick a recipe or add one')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recipe card' })).not.toBeInTheDocument()
    expect(queryClient.getQueryData(['recipes', '1'])).toBeUndefined()
  })

  it('has no Save or Cancel button on the card', async () => {
    setSessionFlag()
    mockRecipes([bread])
    renderApp('/recipes/1')
    const card = await screen.findByRole('region', { name: 'Recipe card' })

    await userEvent.click(await screen.findByTitle('Edit recipe title'))
    expect(within(card).queryByRole('button', { name: /save|cancel/i })).not.toBeInTheDocument()
  })
})

describe('the cache after a save', () => {
  it('shows the edit when going to another recipe and back, with no extra GET, even when the link is clicked at once', async () => {
    setSessionFlag()
    const log = mockRecipes([bread, chili])
    renderApp('/recipes/1')
    const box = await titleBox()
    await userEvent.clear(box)
    await userEvent.type(box, 'Rye bread')
    // No tab: clicking the other recipe's link is what blurs the box and sends the save.
    await userEvent.click(screen.getByRole('link', { name: 'Chili' }))
    expect(await screen.findByRole('heading', { name: 'Chili' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: 'Rye bread' }))

    expect(await screen.findByRole('heading', { name: 'Rye bread' })).toBeInTheDocument()
    expect(log.gets).toEqual({ '1': 1, '2': 1 })
    // The entry under the string id is the recipe the API answered with.
    expect(queryClient.getQueryData(['recipes', '1'])).toEqual({
      id: 1,
      title: 'Rye bread',
      ingredients: [],
      prep_instructions: 'Mix.',
      prep_minutes: null,
      cook_instructions: '',
      cook_minutes: null,
    })
    expect(queryClient.getQueryData(['recipes', 1])).toBeUndefined()
  })

  it('refetches the list when the title changed and not otherwise', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const prep = await openBox('Prep instructions')
    await userEvent.type(prep, ' More.')
    await userEvent.tab()
    await waitFor(() => expect(log.patches).toHaveLength(1))
    await settle()
    expect(log.listGets).toBe(1)

    await retitle('Rye')
    await waitFor(() => expect(log.listGets).toBe(2))
  })

  it('is not overwritten by an older refetch that is still in flight when the answer arrives', async () => {
    setSessionFlag()
    const oldAnswer = gate()
    const log = mockRecipes([bread], {
      onGet: async (_id, n, proceed) => {
        const response = await proceed() // the answer as it stood before the save
        if (n === 1) await oldAnswer.opened
        return response
      },
    })
    renderApp('/recipes/1')
    await screen.findByRole('heading', { name: 'Bread' })
    void queryClient.invalidateQueries({ queryKey: ['recipes', '1'] }) // the second GET is held
    await waitFor(() => expect(log.gets['1']).toBe(2))

    await retitle('Rye')
    await waitFor(() => expect(log.patches).toHaveLength(1))
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).title).toBe('Rye'))
    oldAnswer.open()
    await settle()

    expect((queryClient.getQueryData(['recipes', '1']) as Recipe).title).toBe('Rye')
    expect(screen.getByRole('heading', { name: 'Rye' })).toBeInTheDocument()
  })
})

describe('overlapping saves', () => {
  it('holds the second request until the first is answered, then shows both edits', async () => {
    setSessionFlag()
    const first = gate()
    const log = mockRecipes([bread], {
      onPatch: async (n, proceed) => {
        if (n === 0) await first.opened
        return proceed()
      },
    })
    renderApp('/recipes/1')
    await retitle('Rye')
    await waitFor(() => expect(log.patches).toHaveLength(1)) // the first PATCH has arrived and is held
    const prep = await openBox('Prep instructions')
    await userEvent.clear(prep)
    await userEvent.type(prep, 'Stir.')
    await userEvent.tab()
    await settle()

    // Only the first request has reached the server; the second is waiting its turn.
    expect(log.patches).toHaveLength(1)
    first.open()
    await waitFor(() => expect(log.patches).toHaveLength(2))
    expect(log.patches.map((p) => Object.keys(p.body.recipe))).toEqual([['title'], ['prep_instructions']])
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_instructions).toBe('Stir.'))
    expect(queryClient.getQueryData(['recipes', '1'])).toMatchObject({ title: 'Rye', prep_instructions: 'Stir.' })
    await expectTitleText('Rye')
    await waitFor(() => expect(screen.getByTitle('Edit prep instructions')).toHaveTextContent('Stir.'))
  })

  it('runs the second save after the first failed', async () => {
    setSessionFlag()
    const first = gate()
    const log = mockRecipes([bread], {
      onPatch: async (n, proceed) => {
        if (n === 0) {
          await first.opened
          return HttpResponse.json({}, { status: 500 })
        }
        return proceed()
      },
    })
    renderApp('/recipes/1')
    await retitle('Rye')
    await waitFor(() => expect(log.patches).toHaveLength(1))
    const prep = await openBox('Prep instructions')
    await userEvent.clear(prep)
    await userEvent.type(prep, 'Stir.')
    await userEvent.tab()
    first.open()

    await waitFor(() => expect(log.patches).toHaveLength(2))
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_instructions).toBe('Stir.'))
    expect(log.patches[1].body).toEqual({ recipe: { prep_instructions: 'Stir.' } })
    // The failed title keeps its text and its message.
    expect(screen.getByRole('textbox', { name: 'Recipe title' })).toHaveValue('Rye')
    expect(screen.getByText('Could not save. Try again.')).toBeInTheDocument()
  })
})

describe('the instruction boxes', () => {
  it('saves on blur, keeps line breaks and shows markup as text', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')
    const prep = await openBox('Prep instructions')
    await userEvent.type(prep, 'Mix <b>well</b>.{Enter}Knead.')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { prep_instructions: 'Mix <b>well</b>.\nKnead.' } })
    await waitFor(() =>
      expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_instructions).toBe('Mix <b>well</b>.\nKnead.'),
    )
    expect(prep).toHaveValue('Mix <b>well</b>.\nKnead.')
    expect(screen.getByRole('region', { name: 'Recipe card' }).querySelector('b')).toBeNull()
  })

  it('saves the cooking instructions the same way', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')
    await userEvent.type(await openBox('Cooking instructions'), 'Bake.')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { cook_instructions: 'Bake.' } })
  })

  it('shows the API message under the box on a 422 and goes back to the saved text', async () => {
    setSessionFlag()
    mockRecipes([bread])
    renderApp('/recipes/1')
    const prep = await openBox('Prep instructions')
    fireEvent.change(prep, { target: { value: 'x'.repeat(10_001) } })
    await userEvent.click(prep)
    await userEvent.tab()

    expect(await screen.findByText('Prep instructions is too long (maximum is 10000 characters).')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Prep instructions' })).not.toBeInTheDocument())
    expect(screen.getByTitle('Edit prep instructions')).toHaveTextContent('Mix.')
  })
})

describe('where data goes in', () => {
  it('gives the title and instruction boxes a placeholder, a border and the limit the API enforces', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')

    const title = await titleBox()
    expect(title).toHaveAttribute('placeholder', 'Recipe title')
    expect(title).toHaveAttribute('maxlength', '100')
    for (const [name, placeholder] of [
      ['Prep instructions', 'Prep instructions'],
      ['Cooking instructions', 'Cooking instructions'],
    ]) {
      const box = await openBox(name)
      expect(box).toHaveAttribute('placeholder', placeholder)
      expect(box).toHaveAttribute('maxlength', '10000')
    }
    for (const box of screen.getAllByRole('textbox')) expect(box).toHaveClass('border', 'border-border')
  })
})

describe('the minutes', () => {
  const minutesBox = (name: string) => openBox(name)
  const closed = (title: string) => screen.findByTitle(title)

  it('show as hours and minutes on the heading lines, or a prompt when empty', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Stew', prep_minutes: 125 }])
    renderApp('/recipes/1')

    const prep = await closed('Edit prep minutes')
    expect(prep).toHaveTextContent('2 hr 5 min')
    expect(within(screen.getByRole('heading', { name: 'Prep' }).parentElement!).getByTitle('Edit prep minutes')).toBe(prep)
    const cook = await closed('Edit cook minutes')
    expect(cook).toHaveTextContent('Add cooking time')
    expect(within(screen.getByRole('heading', { name: 'Cook' }).parentElement!).getByTitle('Edit cook minutes')).toBe(cook)
    expect(screen.queryByRole('textbox', { name: /minutes/ })).not.toBeInTheDocument()
  })

  it('open a number box with a placeholder, a border and a limit', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Stew', prep_minutes: 125 }])
    renderApp('/recipes/1')

    const prep = await minutesBox('Prep minutes')
    expect(prep).toHaveValue('125')
    expect(prep).toHaveFocus()
    expect(within(screen.getByRole('heading', { name: 'Prep' }).parentElement!).getByRole('textbox', { name: 'Prep minutes' })).toBe(prep)
    const cook = await minutesBox('Cook minutes')
    expect(cook).toHaveValue('')
    for (const box of [prep, cook]) {
      expect(box).toHaveAttribute('placeholder', 'min')
      expect(box).toHaveAttribute('maxlength', '5')
      expect(box).toHaveAttribute('inputmode', 'numeric')
      expect(box).toHaveClass('border', 'border-border')
    }
  })

  it('send a typed number as a number and go back to text showing the saved time', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.type(box, '80')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { prep_minutes: 80 } })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_minutes).toBe(80))
    expect(await closed('Edit prep minutes')).toHaveTextContent('1 hr 20 min')
    expect(screen.queryByRole('textbox', { name: 'Prep minutes' })).not.toBeInTheDocument()
  })

  it('send null when the box is cleared', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', cook_minutes: 30 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Cook minutes')
    await userEvent.clear(box)
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { cook_minutes: null } })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).cook_minutes).toBeNull())
    expect(await closed('Edit cook minutes')).toHaveTextContent('Add cooking time')
  })

  it('send nothing when the value is unchanged', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', prep_minutes: 20 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.type(box, ' ')
    await userEvent.tab()
    await settle()

    expect(log.patches).toEqual([])
    expect(await closed('Edit prep minutes')).toHaveTextContent('20 min')
  })

  it.each([
    ['0', 0, 'Prep minutes must be greater than 0.'],
    ['-1', '-1', 'Prep minutes must be greater than 0.'],
    ['abc', 'abc', 'Prep minutes must be an integer.'],
  ])('send %s, show the API message on that field and go back to the saved time', async (typed, sent, message) => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', prep_minutes: 20 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.clear(box)
    await userEvent.type(box, typed)
    await userEvent.tab()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(log.patches[0].body).toEqual({ recipe: { prep_minutes: sent } })
    expect(await closed('Edit prep minutes')).toHaveTextContent('20 min')
    expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_minutes).toBe(20)
  })

  it('save on Enter and give focus back to the text', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')
    const box = await minutesBox('Cook minutes')
    await userEvent.type(box, '15{Enter}')

    await waitFor(() => expect(log.patches).toHaveLength(1))
    const text = await closed('Edit cook minutes')
    await waitFor(() => expect(text).toHaveFocus())
    expect(text).toHaveTextContent('15 min')
  })
})

describe('editing one field at a time', () => {
  it('shows every field as text, with a prompt for the empty ones, and no boxes', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')

    expect(await screen.findByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    expect(screen.getByTitle('Edit prep instructions')).toHaveTextContent('Add prep instructions')
    expect(screen.getByTitle('Edit cooking instructions')).toHaveTextContent('Add cooking instructions')
    expect(screen.getByTitle('Edit prep minutes')).toHaveTextContent('Add prep time')
    expect(screen.queryAllByRole('textbox').filter((box) => !/^Ingredient/.test(box.getAttribute('aria-label') ?? ''))).toEqual([])
  })

  it('opens the title from the keyboard with its text selected, and Escape closes it without saving', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const opener = await screen.findByTitle('Edit recipe title')
    opener.focus()
    await userEvent.keyboard('{Enter}')

    const box = (await screen.findByRole('textbox', { name: 'Recipe title' })) as HTMLInputElement
    expect(box).toHaveFocus()
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 5])
    await userEvent.type(box, 'Zzz')
    await userEvent.keyboard('{Escape}')

    await expectTitleText('Bread')
    expect(log.patches).toEqual([])
    expect(screen.getByTitle('Edit recipe title')).toHaveFocus()
  })

  it('saves the title on Enter, closes the box and returns focus to the heading text', async () => {
    setSessionFlag()
    const log = mockRecipes([bread])
    renderApp('/recipes/1')
    const box = await titleBox()
    await userEvent.clear(box)
    await userEvent.type(box, 'Rye{Enter}')

    await waitFor(() => expect(log.patches).toHaveLength(1))
    await expectTitleText('Rye')
    await waitFor(() => expect(screen.getByTitle('Edit recipe title')).toHaveFocus())
  })

  it('shows the instructions as text with line breaks, markup as text, and opens the box on click', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Bread', prep_instructions: 'Mix <b>well</b>.\nKnead.' }])
    renderApp('/recipes/1')

    const text = await screen.findByTitle('Edit prep instructions')
    expect(text.querySelector('b')).toBeNull()
    expect(text.querySelector('span')).toHaveClass('whitespace-pre-line')
    expect(text.textContent).toBe('Mix <b>well</b>.\nKnead.')
    const box = await openBox('Prep instructions')
    expect(box).toHaveValue('Mix <b>well</b>.\nKnead.')
    expect(box).toHaveFocus()
  })

  it('gives the heading a pencil cue', async () => {
    setSessionFlag()
    mockRecipes([bread])
    renderApp('/recipes/1')

    const opener = await screen.findByTitle('Edit recipe title')
    expect(opener.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('the ingredient rows', () => {
  const stew = {
    id: 1,
    title: 'Stew',
    ingredients: [
      { name: 'beef', amount: '500 g' },
      { name: 'salt', amount: '' },
      { name: 'pepper', amount: 'a pinch' },
    ],
  }
  const field = (index: number, which: 'amount' | 'name') =>
    screen.getByRole('textbox', { name: `Ingredient ${index} ${which}` }) as HTMLInputElement

  it('always has a blank row with a placeholder, a border and a limit, even on an empty recipe', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Water' }])
    renderApp('/recipes/1')

    const amount = await screen.findByRole('textbox', { name: 'Ingredient 1 amount' })
    const name = screen.getByRole('textbox', { name: 'Ingredient 1 name' })
    expect(amount).toHaveAttribute('placeholder', 'Amount')
    expect(amount).toHaveAttribute('maxlength', '50')
    expect(name).toHaveAttribute('placeholder', 'Ingredient')
    expect(name).toHaveAttribute('maxlength', '100')
    expect(amount).toHaveClass('border', 'border-border')
    expect(name).toHaveClass('border', 'border-border')
    expect(screen.queryByRole('textbox', { name: 'Ingredient 2 name' })).not.toBeInTheDocument()
  })

  it('shows a blank row after the saved rows', async () => {
    setSessionFlag()
    mockRecipes([stew])
    renderApp('/recipes/1')

    await screen.findByRole('textbox', { name: 'Ingredient 1 name' })
    expect([1, 2, 3, 4].map((i) => field(i, 'name').value)).toEqual(['beef', 'salt', 'pepper', ''])
    expect(field(1, 'amount').value).toBe('500 g')
  })

  it('sends the whole list in order when the blank row is filled in, then offers a new blank row', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 name' })
    await userEvent.type(field(4, 'amount'), '2 tsp')
    await userEvent.type(field(4, 'name'), 'thyme')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({
      recipe: {
        ingredients: [
          { name: 'beef', amount: '500 g' },
          { name: 'salt', amount: '' },
          { name: 'pepper', amount: 'a pinch' },
          { name: 'thyme', amount: '2 tsp' },
        ],
      },
    })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).ingredients).toHaveLength(4))
    expect([1, 2, 3, 4, 5].map((i) => field(i, 'name').value)).toEqual(['beef', 'salt', 'pepper', 'thyme', ''])
  })

  it('keeps the input and its focus while typing into the blank row', async () => {
    setSessionFlag()
    mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 name' })
    const blankName = field(4, 'name')
    await userEvent.type(blankName, 'thyme')

    expect(blankName).toHaveFocus()
    expect(blankName.isConnected).toBe(true)
    expect(blankName).toHaveValue('thyme')
    expect(field(5, 'name')).toHaveValue('')
  })

  it('drops a row cleared of name and amount, keeps focus on the input clicked into, and never sends the blank row', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 3 name' })
    const third = field(3, 'name')
    await userEvent.clear(field(2, 'name'))
    await userEvent.click(third) // blurs the emptied row, which is dropped, and moves focus to a row below it

    expect(third.isConnected).toBe(true)
    expect(third).toHaveFocus()
    expect(third).toHaveValue('pepper') // still the same row's input, not another row's that took its place
    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({
      recipe: {
        ingredients: [
          { name: 'beef', amount: '500 g' },
          { name: 'pepper', amount: 'a pinch' },
        ],
      },
    })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).ingredients).toHaveLength(2))
    // The answer replaced the draft without remounting the input that has focus.
    expect(third.isConnected).toBe(true)
    expect(third).toHaveFocus()
    expect(third).toHaveValue('pepper')
    expect([1, 2, 3].map((i) => field(i, 'name').value)).toEqual(['beef', 'pepper', ''])
  })

  it('does not drop a row when focus moves between its own two inputs', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 1 name' })
    await userEvent.clear(field(1, 'name'))
    await userEvent.click(field(1, 'amount'))
    await userEvent.clear(field(1, 'amount'))
    await settle()

    expect(log.patches).toEqual([])
    expect(field(1, 'amount')).toBeInTheDocument()
    await userEvent.tab() // into the row's name input, still the same row
    expect(log.patches).toEqual([])
    await userEvent.tab() // out of the row
    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body.recipe.ingredients).toEqual([
      { name: 'salt', amount: '' },
      { name: 'pepper', amount: 'a pinch' },
    ])
  })

  it('sends nothing for a blank row that was only visited, or when nothing changed', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 name' })
    await userEvent.click(field(4, 'name'))
    await userEvent.type(field(4, 'name'), '   ')
    await userEvent.click(field(1, 'name'))
    await userEvent.type(field(1, 'name'), ' ')
    await userEvent.tab()
    await settle()

    expect(log.patches).toEqual([])
  })

  it('sends the whole list when one amount changes', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 2 amount' })
    await userEvent.type(field(2, 'amount'), '1 tsp')
    await userEvent.tab()
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body.recipe.ingredients).toEqual([
      { name: 'beef', amount: '500 g' },
      { name: 'salt', amount: '1 tsp' },
      { name: 'pepper', amount: 'a pinch' },
    ])
  })

  it('shows "Ingredient N: ..." for a row with only an amount, and reverts the rows to the saved list', async () => {
    setSessionFlag()
    const log = mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 amount' })
    await userEvent.type(field(4, 'amount'), '2 tsp')
    await userEvent.click(field(1, 'name'))

    const message = await screen.findByText("Ingredient 4: Name can't be blank.")
    expect(message.closest('[role="alert"]')).toHaveClass('text-destructive')
    expect(log.patches).toHaveLength(1)
    await waitFor(() => expect([1, 2, 3, 4].map((i) => field(i, 'name').value)).toEqual(['beef', 'salt', 'pepper', '']))
    expect(field(4, 'amount')).toHaveValue('')
    expect((queryClient.getQueryData(['recipes', '1']) as Recipe).ingredients).toHaveLength(3)
  })

  it('numbers an over-long name by its place in the list that was sent', async () => {
    setSessionFlag()
    mockRecipes([stew])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 2 name' })
    fireEvent.change(field(2, 'name'), { target: { value: 'x'.repeat(101) } })
    await userEvent.click(field(2, 'name'))
    await userEvent.tab()
    await userEvent.tab()

    expect(await screen.findByText('Ingredient 2: Name is too long (maximum is 100 characters).')).toBeInTheDocument()
  })

  it('keeps the typed rows on a 500 and sends them again on the next blur', async () => {
    setSessionFlag()
    const log = mockRecipes([stew], {
      onPatch: (n, proceed) => (n === 0 ? HttpResponse.json({}, { status: 500 }) : proceed()),
    })
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 name' })
    await userEvent.type(field(4, 'name'), 'thyme')
    await userEvent.tab()
    await userEvent.tab()

    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    expect(field(4, 'name')).toHaveValue('thyme')
    await userEvent.click(field(4, 'name'))
    await userEvent.click(field(1, 'name'))

    await waitFor(() => expect(log.patches).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('Could not save. Try again.')).not.toBeInTheDocument())
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).ingredients).toHaveLength(4))
  })

  it('replaces the cache with the answer so leaving and returning shows the new list', async () => {
    setSessionFlag()
    const log = mockRecipes([stew, chili])
    renderApp('/recipes/1')
    await screen.findByRole('textbox', { name: 'Ingredient 4 name' })
    await userEvent.type(field(4, 'name'), 'thyme')
    await userEvent.click(screen.getByRole('link', { name: 'Chili' }))
    await screen.findByRole('heading', { name: 'Chili' })
    await userEvent.click(screen.getByRole('link', { name: 'Stew' }))

    await waitFor(() => expect(field(4, 'name')).toHaveValue('thyme'))
    expect(log.gets['1']).toBe(1)
  })
})
