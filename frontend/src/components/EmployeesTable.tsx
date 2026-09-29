import type { Employee } from '../services/auth'
import type { RoleSummary } from '../services/roles'
import RoleBadge from './RoleBadge'
import StatusMessage from './StatusMessage'

export interface EmployeeActions {
  canSetRole: boolean
  canManagePermissions: boolean
  canDeactivate: boolean
  onChangeRole: (employee: Employee, roleId: number) => void
  onEditPermissions: (employee: Employee) => void
  onDeactivate: (employee: Employee) => void
}

interface EmployeesTableProps {
  employees: Employee[]
  roles: RoleSummary[]
  loading: boolean
  error: string | null
  currentEmployeeId: number
  actions: EmployeeActions
}

function RoleCell({
  employee,
  roles,
  editable,
  onChange,
}: {
  employee: Employee
  roles: RoleSummary[]
  editable: boolean
  onChange: (roleId: number) => void
}) {
  const hasOverrides = employee.overrides.granted.length + employee.overrides.denied.length > 0
  if (!editable) {
    return (
      <>
        <RoleBadge role={employee.role} />
        {hasOverrides && <span className="hint"> · com exceções</span>}
      </>
    )
  }
  return (
    <>
      <select
        aria-label={`Cargo de ${employee.full_name}`}
        value={employee.role.id}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      {hasOverrides && <span className="hint"> · com exceções</span>}
    </>
  )
}

export default function EmployeesTable({
  employees,
  roles,
  loading,
  error,
  currentEmployeeId,
  actions,
}: EmployeesTableProps) {
  if (loading) return <p className="message">Carregando…</p>
  if (error) return <StatusMessage tone="error">{error}</StatusMessage>
  if (employees.length === 0) return <p className="message">Nenhum funcionário cadastrado ainda.</p>

  return (
    <div className="table-scroll">
      <table className="checkins employees">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Usuário</th>
            <th>Cargo</th>
            <th>Situação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const isOther = employee.active && employee.id !== currentEmployeeId
            return (
              <tr key={employee.id}>
                <td data-label="Nome">{employee.full_name}</td>
                <td data-label="Usuário">{employee.username}</td>
                <td data-label="Cargo">
                  <RoleCell
                    employee={employee}
                    roles={roles}
                    editable={actions.canSetRole && isOther}
                    onChange={(roleId) => actions.onChangeRole(employee, roleId)}
                  />
                </td>
                <td data-label="Situação">{employee.active ? 'Ativo' : 'Excluído'}</td>
                <td data-label="" className="row-actions">
                  {actions.canManagePermissions && employee.active && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => actions.onEditPermissions(employee)}
                    >
                      Permissões
                    </button>
                  )}
                  {actions.canDeactivate && isOther && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => actions.onDeactivate(employee)}
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
