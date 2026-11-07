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

const titleBox = () => screen.findByRole('textbox', { name: 'Recipe title' })

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
    expect(box).toHaveValue('Bread')
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
    expect(box).toHaveValue('Bread')
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
    expect(box).toHaveValue('Bread')
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

    await userEvent.type(box, 'a')
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

    expect(within(card).queryAllByRole('button')).toEqual([])
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
    const prep = await screen.findByRole('textbox', { name: 'Prep instructions' })
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
    const prep = screen.getByRole('textbox', { name: 'Prep instructions' })
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
    expect(screen.getByRole('heading', { name: 'Rye' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Prep instructions' })).toHaveValue('Stir.')
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
    const prep = screen.getByRole('textbox', { name: 'Prep instructions' })
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
    const prep = await screen.findByRole('textbox', { name: 'Prep instructions' })
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
    await userEvent.type(await screen.findByRole('textbox', { name: 'Cooking instructions' }), 'Bake.')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { cook_instructions: 'Bake.' } })
  })

  it('shows the API message under the box on a 422 and goes back to the saved text', async () => {
    setSessionFlag()
    mockRecipes([bread])
    renderApp('/recipes/1')
    const prep = await screen.findByRole('textbox', { name: 'Prep instructions' })
    fireEvent.change(prep, { target: { value: 'x'.repeat(10_001) } })
    await userEvent.click(prep)
    await userEvent.tab()

    expect(await screen.findByText('Prep instructions is too long (maximum is 10000 characters).')).toBeInTheDocument()
    expect(prep).toHaveValue('Mix.')
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
      const box = screen.getByRole('textbox', { name })
      expect(box).toHaveAttribute('placeholder', placeholder)
      expect(box).toHaveAttribute('maxlength', '10000')
    }
    for (const box of screen.getAllByRole('textbox')) expect(box).toHaveClass('border', 'border-border')
  })
})

describe('the minutes boxes', () => {
  const minutesBox = (name: string) => screen.findByRole('textbox', { name })

  it('sit on their heading lines with a placeholder, a border, a limit and no hr min text', async () => {
    setSessionFlag()
    mockRecipes([{ id: 1, title: 'Stew', prep_minutes: 125 }])
    renderApp('/recipes/1')

    const prep = await minutesBox('Prep minutes')
    expect(prep).toHaveValue('125')
    expect(within(screen.getByRole('heading', { name: 'Prep' }).parentElement!).getByRole('textbox', { name: 'Prep minutes' })).toBe(prep)
    const cook = screen.getByRole('textbox', { name: 'Cook minutes' })
    expect(within(screen.getByRole('heading', { name: 'Cook' }).parentElement!).getByRole('textbox', { name: 'Cook minutes' })).toBe(cook)
    expect(cook).toHaveValue('')
    for (const box of [prep, cook]) {
      expect(box).toHaveAttribute('placeholder', 'min')
      expect(box).toHaveAttribute('maxlength', '5')
      expect(box).toHaveAttribute('inputmode', 'numeric')
      expect(box).toHaveClass('border', 'border-border')
    }
    expect(screen.queryByText(/\bhr\b/)).not.toBeInTheDocument()
  })

  it('sends a typed number as a number, and the saved value stays in the box', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread' }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.type(box, '45')
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { prep_minutes: 45 } })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_minutes).toBe(45))
    expect(box).toHaveValue('45')
  })

  it('sends null when the box is cleared', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', cook_minutes: 30 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Cook minutes')
    await userEvent.clear(box)
    await userEvent.tab()

    await waitFor(() => expect(log.patches).toHaveLength(1))
    expect(log.patches[0].body).toEqual({ recipe: { cook_minutes: null } })
    await waitFor(() => expect((queryClient.getQueryData(['recipes', '1']) as Recipe).cook_minutes).toBeNull())
    expect(box).toHaveValue('')
  })

  it('sends nothing when the value is unchanged', async () => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', prep_minutes: 20 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.type(box, ' ')
    await userEvent.tab()
    await settle()

    expect(log.patches).toEqual([])
    expect(box).toHaveValue('20')
  })

  it.each([
    ['0', 0, 'Prep minutes must be greater than 0.'],
    ['-1', '-1', 'Prep minutes must be greater than 0.'],
    ['abc', 'abc', 'Prep minutes must be an integer.'],
  ])('sends %s, shows the API message on that field and goes back to the saved value', async (typed, sent, message) => {
    setSessionFlag()
    const log = mockRecipes([{ id: 1, title: 'Bread', prep_minutes: 20 }])
    renderApp('/recipes/1')
    const box = await minutesBox('Prep minutes')
    await userEvent.clear(box)
    await userEvent.type(box, typed)
    await userEvent.tab()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(log.patches[0].body).toEqual({ recipe: { prep_minutes: sent } })
    expect(box).toHaveValue('20')
    expect((queryClient.getQueryData(['recipes', '1']) as Recipe).prep_minutes).toBe(20)
  })
})
