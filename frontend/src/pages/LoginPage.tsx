import { useState, type FormEvent } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { login } from '../services/auth'

export default function LoginPage() {
  const { loginWithResponse } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      loginWithResponse(await login(username, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao entrar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page login-page">
      <ThemeToggle />
      <h1>Porto Baía Verde</h1>
      <p className="subtitle">Entre com o usuário e a senha cadastrados pelo administrador.</p>

      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="login-username">Usuário</label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={sending}
          autoFocus
        />

        <label htmlFor="login-password">Senha</label>
        <div className="password-field">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={sending}
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary" disabled={sending || !username || !password}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  )
}
