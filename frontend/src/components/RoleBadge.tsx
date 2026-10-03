import type { RoleSummary } from '../services/roles'

export function roleTone(role: RoleSummary): string {
  return role.is_system ? role.key : 'custom'
}

export default function RoleBadge({ role }: Readonly<{ role: RoleSummary }>) {
  return <span className={`role-badge role-badge-${roleTone(role)}`}>{role.name}</span>
}
