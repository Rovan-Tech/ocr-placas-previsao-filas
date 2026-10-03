import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../src/context/ThemeContext'

function wrap(ui: ReactElement, route: string) {
  return (
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ThemeProvider>
  )
}

export function renderPage(ui: ReactElement, route = '/') {
  const view = render(wrap(ui, route))
  return { ...view, rerenderPage: (next: ReactElement) => view.rerender(wrap(next, route)) }
}
