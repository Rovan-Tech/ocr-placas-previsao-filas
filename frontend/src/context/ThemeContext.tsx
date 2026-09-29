import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'ocr-placas.theme'
const CHOICE_KEY = 'ocr-placas.theme-chosen'

function hasChosenTheme(): boolean {
  try {
    return localStorage.getItem(CHOICE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberThemeChoice() {
  try {
    localStorage.setItem(CHOICE_KEY, '1')
  } catch {}
}

function loadStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  preferDarkUnlessChosen: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme() ?? 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => {
        rememberThemeChoice()
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
      },
      preferDarkUnlessChosen: () => {
        if (!hasChosenTheme()) setTheme('dark')
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return context
}
