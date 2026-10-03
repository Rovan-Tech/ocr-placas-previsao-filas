import { useState } from 'react'
import type { Employee } from '../services/auth'
import {
  overrideChoiceFor,
  overridesFromChoices,
  type OverrideChoice,
  type PermissionKey,
  type PermissionsMatrix,
} from '../services/roles'
import InfoTip from './InfoTip'
import StatusMessage from './StatusMessage'

interface OverridesEditorProps {
  employee: Employee
  matrix: PermissionsMatrix
  onCancel: () => void
  onSave: (employee: Employee, overrides: ReturnType<typeof overridesFromChoices>) => Promise<void>
}

export default function OverridesEditor({
  employee,
  matrix,
  onCancel,
  onSave,
}: Readonly<OverridesEditorProps>) {
  const rolePermissions = matrix.roles.find((role) => role.id === employee.role.id)?.permissions
  const [choices, setChoices] = useState<Record<string, OverrideChoice>>(() =>
    Object.fromEntries(
      matrix.catalog.flatMap((screen) =>
        screen.permissions.map((item) => [
          item.key,
          overrideChoiceFor(employee.overrides, item.key),
        ]),
      ),
    ),
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSending(true)
    setError(null)
    try {
      await onSave(employee, overridesFromChoices(choices))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao salvar as exceções.')
      setSending(false)
    }
  }

  function inheritLabel(key: PermissionKey): string {
    return rolePermissions?.includes(key) ? 'Seguir o cargo (permite)' : 'Seguir o cargo (bloqueia)'
  }

  return (
    <section className="overrides-editor" aria-label={`Permissões de ${employee.full_name}`}>
      <h2>Permissões de {employee.full_name}</h2>
      <p className="hint">
        Cargo: {employee.role.name}. Libere ou bloqueie ações só para esta pessoa, sem mudar o cargo
        dela.
      </p>
      {matrix.catalog.map((screen) => (
        <fieldset key={screen.key}>
          <legend>{screen.label}</legend>
          {screen.permissions.map((item) => (
            <div key={item.key} className="override-row">
              <span className="override-label">
                {item.label}
                <InfoTip label={item.label} text={item.description} />
              </span>
              <select
                aria-label={item.label}
                value={choices[item.key] ?? 'inherit'}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [item.key]: event.target.value as OverrideChoice,
                  }))
                }
                disabled={sending}
              >
                <option value="inherit">{inheritLabel(item.key)}</option>
                <option value="grant">Liberar</option>
                <option value="deny">Bloquear</option>
              </select>
            </div>
          ))}
        </fieldset>
      ))}
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="camera-actions">
        <button type="button" className="primary" onClick={handleSave} disabled={sending}>
          {sending ? 'Salvando…' : 'Salvar exceções'}
        </button>
        <button type="button" onClick={onCancel} disabled={sending}>
          Cancelar
        </button>
      </div>
    </section>
  )
}
