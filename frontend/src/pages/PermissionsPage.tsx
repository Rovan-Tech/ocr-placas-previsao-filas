import { CheckCircle2, Eye, MinusCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchPermissions, type PermissionsMatrix } from '../services/auth'
import { ROLES, SCREENS, accessLabel, roleLabel, screenLabel, type Access } from '../services/roles'

const ACCESS_ICONS: Record<Access, LucideIcon> = {
  full: CheckCircle2,
  read: Eye,
  none: MinusCircle,
}

const LEGEND: Access[] = ['full', 'read', 'none']

function AccessIcon({ access, decorative = false }: { access: Access; decorative?: boolean }) {
  const Icon = ACCESS_ICONS[access]
  return (
    <span className={`access-icon access-icon-${access}`} title={accessLabel(access)}>
      {decorative ? (
        <Icon aria-hidden="true" size={20} />
      ) : (
        <Icon aria-label={accessLabel(access)} size={22} />
      )}
    </span>
  )
}

function PermissionsTable({ matrix }: { matrix: PermissionsMatrix }) {
  return (
    <div className="table-scroll">
      <table className="permissions-table">
        <thead>
          <tr>
            <th>Cargo</th>
            {SCREENS.map((screen) => (
              <th key={screen}>{screenLabel(screen)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <tr key={role}>
              <th scope="row">
                <span className={`role-dot role-dot-${role}`} aria-hidden="true" />
                {roleLabel(role)}
              </th>
              {SCREENS.map((screen) => (
                <td key={screen}>
                  <AccessIcon access={matrix.roles[role][screen]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PermissionsPage() {
  const { token } = useAuth()
  const [matrix, setMatrix] = useState<PermissionsMatrix | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetchPermissions(token)
      .then(setMatrix)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar as permissões.'),
      )
  }, [token])

  return (
    <section className="page page-wide">
      <h1>Permissões por cargo</h1>
      <p className="subtitle">
        O que cada cargo pode ver e fazer no sistema. Só o Administrador enxerga esta tela.
      </p>

      {!matrix && !error && <p className="message">Carregando…</p>}
      {error && <p className="message error">{error}</p>}
      {matrix && <PermissionsTable matrix={matrix} />}

      <ul className="access-legend" aria-label="Legenda">
        {LEGEND.map((access) => (
          <li key={access}>
            <AccessIcon access={access} decorative />
            {accessLabel(access)}
          </li>
        ))}
      </ul>
    </section>
  )
}
