import { roleLabel, type Role } from '../services/roles'

export default function RoleBadge({ role }: { role: Role }) {
  return <span className={`role-badge role-badge-${role}`}>{roleLabel(role)}</span>
}
