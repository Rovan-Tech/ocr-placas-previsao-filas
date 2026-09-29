import { useState } from 'react'
import type { Employee } from '../services/auth'
import StatusMessage from './StatusMessage'

interface DeactivateConfirmationProps {
  employee: Employee
  onCancel: () => void
  onConfirm: (employee: Employee) => Promise<void>
}

export default function DeactivateConfirmation({
  employee,
  onCancel,
  onConfirm,
}: DeactivateConfirmationProps) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSending(true)
    setError(null)
    try {
      await onConfirm(employee)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao excluir o funcionário.')
      setSending(false)
    }
  }

  return (
    <div
      className="verification tone-danger"
      role="alertdialog"
      aria-label="Confirmar exclusão de funcionário"
    >
      <strong>Tem certeza que deseja excluir este funcionário?</strong>
      <span>
        Nome: <strong>{employee.full_name}</strong>
      </span>
      <span>
        Usuário: <strong>{employee.username}</strong>
      </span>
      <span>Cargo: {employee.role.name}</span>
      <span>
        Ele perde o acesso imediatamente. O histórico de fotos e placas que ele já enviou continua
        registrado nos logs.
      </span>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="camera-actions">
        <button type="button" className="primary" onClick={handleConfirm} disabled={sending}>
          {sending ? 'Excluindo…' : 'Sim, excluir'}
        </button>
        <button type="button" onClick={onCancel} disabled={sending}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
