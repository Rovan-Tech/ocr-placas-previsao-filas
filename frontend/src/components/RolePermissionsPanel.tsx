import { useState } from 'react'
import type { PermissionKey, RoleDetail, ScreenDef } from '../services/roles'
import InfoTip from './InfoTip'

interface RolePermissionsPanelProps {
  role: RoleDetail
  catalog: ScreenDef[]
  granted: PermissionKey[]
  onToggle: (key: PermissionKey) => void
  onDelete: (role: RoleDetail) => void
}

function DeleteRole({
  role,
  onDelete,
}: Readonly<{
  role: RoleDetail
  onDelete: (role: RoleDetail) => void
}>) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        className="danger-outline"
        aria-label={`Excluir cargo ${role.name}`}
        onClick={() => setConfirming(true)}
      >
        Excluir cargo
      </button>
    )
  }
  return (
    <span className="delete-confirm">
      Excluir “{role.name}”?
      <button type="button" className="danger-outline" onClick={() => onDelete(role)}>
        Sim, excluir
      </button>
      <button type="button" onClick={() => setConfirming(false)}>
        Cancelar
      </button>
    </span>
  )
}

export default function RolePermissionsPanel({
  role,
  catalog,
  granted,
  onToggle,
  onDelete,
}: Readonly<RolePermissionsPanelProps>) {
  return (
    <section className="role-panel" role="tabpanel" aria-label={`Permissões de ${role.name}`}>
      <header className="role-panel-header">
        <div>
          <h2>{role.name}</h2>
          <p className="hint">
            {role.is_system
              ? 'Cargo do sistema: dá para mudar as permissões, mas não o nome nem excluir.'
              : 'Cargo criado por você: dá para mudar as permissões e excluir se ninguém usar.'}
          </p>
        </div>
        {!role.is_system && <DeleteRole role={role} onDelete={onDelete} />}
      </header>

      <div className="perm-cards">
        {catalog.map((screen) => (
          <article className="perm-card" key={screen.key}>
            <h3>{screen.label}</h3>
            {screen.permissions.map((item) => (
              <div className="perm-row" key={item.key}>
                <label htmlFor={`perm-${item.key}`} className="perm-label">
                  {item.label}
                </label>
                <InfoTip label={item.label} text={item.description} />
                <input
                  id={`perm-${item.key}`}
                  type="checkbox"
                  className="switch"
                  checked={granted.includes(item.key)}
                  onChange={() => onToggle(item.key)}
                />
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  )
}
