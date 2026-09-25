import { useState, type FormEvent } from 'react'
import { ApiError, submitPlateManually, type ManualPlateContext, type OcrUploadResponse } from '../services/api'
import StatusMessage from './StatusMessage'

interface ManualPlateEntryProps {
  onSubmit: (result: OcrUploadResponse) => void
  onCancel: () => void
  context?: ManualPlateContext
}

const MAX_LENGTH = 8

export default function ManualPlateEntry({ onSubmit, onCancel, context }: ManualPlateEntryProps) {
  const [plate, setPlate] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      onSubmit(await submitPlateManually(plate, context))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado ao registrar a placa.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="manual-entry" onSubmit={handleSubmit}>
      <label htmlFor="manual-plate">Digite a placa do veículo</label>
      <input
        id="manual-plate"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Ex.: ABC1D23 ou ABC-1234"
        maxLength={MAX_LENGTH}
        value={plate}
        onChange={(event) => setPlate(event.target.value.toUpperCase())}
        disabled={sending}
        autoFocus
      />
      <p className="hint">
        O sistema identifica sozinho, pela ordem das letras e números, se é o padrão Mercosul ou
        o padrão antigo.
      </p>
      {context?.photo && (
        <p className="hint">A foto será salva junto com a placa digitada, só de resguardo.</p>
      )}

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <div className="camera-actions">
        <button type="submit" className="primary" disabled={sending || plate.trim().length === 0}>
          {sending ? 'Registrando…' : 'Confirmar placa'}
        </button>
        <button type="button" onClick={onCancel} disabled={sending}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
