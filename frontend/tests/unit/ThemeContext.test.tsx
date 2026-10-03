import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from '../../src/components/ThemeToggle'
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext'
import { stubMatchMedia } from './support/fixtures'

function ThemeProbe() {
  const { theme } = useTheme()
  return <p data-testid="theme">{theme}</p>
}

function renderWithToggle() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
      <ThemeToggle />
    </ThemeProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('ThemeProvider', () => {
  it('usa o tema escuro por padrão em tela de desktop', () => {
    stubMatchMedia(true)

    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('usa o tema claro por padrão em tela de celular', () => {
    stubMatchMedia(false)

    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('respeita a escolha guardada, mesmo diferente do padrão da tela', () => {
    stubMatchMedia(true)
    localStorage.setItem('ocr-placas.theme-chosen', '1')
    localStorage.setItem('ocr-placas.theme', 'light')

    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('ignora o tema guardado quando o usuário nunca escolheu', () => {
    stubMatchMedia(true)
    localStorage.setItem('ocr-placas.theme', 'light')

    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('ignora um tema guardado com valor desconhecido', () => {
    stubMatchMedia(false)
    localStorage.setItem('ocr-placas.theme-chosen', '1')
    localStorage.setItem('ocr-placas.theme', 'roxo')

    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('alterna o tema, grava a escolha e atualiza o atributo do documento', async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    renderWithToggle()

    await user.click(screen.getByRole('switch', { name: 'Mudar para tema claro' }))

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('ocr-placas.theme')).toBe('light')
    expect(localStorage.getItem('ocr-placas.theme-chosen')).toBe('1')
    expect(screen.getByRole('switch', { name: 'Mudar para tema escuro' })).not.toBeChecked()
  })

  it('funciona mesmo com o armazenamento local bloqueado', async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    renderWithToggle()

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    await user.click(screen.getByRole('switch'))

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })
})

describe('useTheme', () => {
  it('lança erro claro fora do ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ThemeProbe />)).toThrow('useTheme precisa estar dentro de <ThemeProvider>')
  })
})
