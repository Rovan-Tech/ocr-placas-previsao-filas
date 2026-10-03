import { Anchor, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import StatusMessage from '../components/StatusMessage'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { login } from '../services/auth'

const ROLES = [
  { id: 'fiscal', label: 'Fiscal de Portaria — só captura e check-ins' },
  { id: 'planejador', label: 'Planejador de Agendamentos' },
  { id: 'analista', label: 'Analista de Operações — só leitura' },
  { id: 'supervisor', label: 'Supervisor de Turno' },
  { id: 'admin', label: 'Administrador — acesso total' },
]

function Waves({ className }: Readonly<{ className: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 160"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 80 C 60 30, 130 30, 200 70 S 340 120, 400 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M0 120 C 70 80, 150 90, 220 120 S 340 150, 400 110"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

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
    <div className="login-shell">
      <aside className="login-brand-panel" aria-label="Sobre o sistema">
        <Waves className="login-waves-panel" />
        <div className="login-brand-lockup">
          <span className="login-logo">
            <Anchor size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="login-brand-name">Porto Baía Verde</h1>
            <p className="login-brand-tagline">Sistema de check-in da guarita</p>
          </div>
        </div>
        <div className="login-brand-copy">
          <p className="login-brand-headline">
            Leitura de placas e previsão de fila, do jeito que cada função do time precisa.
          </p>
          <p className="login-brand-caption">
            Cada pessoa vê só o que o cargo dela permite — da guarita à administração.
          </p>
          <ul className="login-roles" aria-label="Cargos do sistema">
            {ROLES.map((role) => (
              <li key={role.id}>
                <span className={`login-role-dot role-${role.id}`} aria-hidden="true" />
                {role.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="login-brand-footer">Rovan · projeto de portfólio</p>
      </aside>
      <section className="page login-page">
        <ThemeToggle />
        <Waves className="login-waves-inline" />
        <div className="login-brand-inline">
          <span className="login-logo">
            <Anchor size={26} aria-hidden="true" />
          </span>
          <h1 className="login-brand-title">Porto Baía Verde</h1>
          <p className="login-brand-subtitle">Check-in na guarita</p>
        </div>

        <div className="login-card">
          <h2>Entrar</h2>
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
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
                <span>{showPassword ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>

            {error && <StatusMessage tone="error">{error}</StatusMessage>}

            <button type="submit" className="primary" disabled={sending || !username || !password}>
              {sending ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="manual-entry-link">
            Só quer conhecer o sistema? <Link to="/demo">Testar sem login</Link>
          </p>
        </div>

        <p className="login-footer">Rovan · projeto de portfólio</p>
      </section>
    </div>
  )
}
