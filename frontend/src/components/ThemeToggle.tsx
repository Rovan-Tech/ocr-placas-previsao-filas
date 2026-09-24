import { useTheme } from '../context/ThemeContext'

/** Alterna entre fundo claro e escuro — visível em toda tela, inclusive antes do login. */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      {isDark ? '☀️ Claro' : '🌙 Escuro'}
    </button>
  )
}
