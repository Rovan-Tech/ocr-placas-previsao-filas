import { useState, type FormEvent } from 'react'
import StatusMessage from '../components/StatusMessage'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { changePassword } from '../services/auth'

const MIN_LENGTH = 8

export default function ChangePasswordPage() {
  const { token, onPasswordChanged, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    if (newPassword.length < MIN_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As duas senhas digitadas são diferentes.')
      return
    }

    setSending(true)
    setError(null)
    try {
      onPasswordChanged(await changePassword(token, currentPassword, newPassword))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao trocar a senha.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page login-page">
      <ThemeToggle />
      <h1>Troque sua senha</h1>
      <p className="subtitle">
        É preciso definir uma senha nova antes de continuar — no primeiro acesso, ou a cada 30
        dias.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="current-password">Senha atual</label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={sending}
          autoFocus
        />

        <label htmlFor="new-password">Nova senha</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="confirm-password">Confirme a nova senha</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={sending}
        />

        {error && <StatusMessage tone="error">{error}</StatusMessage>}

        <div className="camera-actions">
          <button
            type="submit"
            className="primary"
            disabled={sending || !currentPassword || !newPassword || !confirmPassword}
          >
            {sending ? 'Trocando…' : 'Trocar senha'}
          </button>
          <button type="button" onClick={logout} disabled={sending}>
            Sair
          </button>
        </div>
      </form>
    </section>
  )
}
