import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import DeactivateConfirmation from '../components/DeactivateConfirmation'
import EmployeesTable from '../components/EmployeesTable'
import OverridesEditor from '../components/OverridesEditor'
import StatusMessage from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import {
  changeEmployeeRole,
  createEmployee,
  deactivateEmployee,
  fetchPermissions,
  fetchRoles,
  listEmployees,
  setEmployeeOverrides,
  type Employee,
} from '../services/auth'
import { can, type Overrides, type PermissionsMatrix, type RoleSummary } from '../services/roles'

const MIN_LENGTH = 8

function useEmployeeList(token: string | null) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!token) return
    Promise.all([listEmployees(token), fetchRoles(token)])
      .then(([employeeList, roleList]) => {
        setEmployees(employeeList)
        setRoles(roleList)
        setError(null)
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar funcionários.'),
      )
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => load(), [load])

  function replace(updated: Employee) {
    setEmployees((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
  }

  return { employees, setEmployees, roles, loading, error, replace }
}

export default function CreateEmployeePage() {
  const { token, employee: currentEmployee } = useAuth()
  const permissions = currentEmployee?.permissions
  const { employees, setEmployees, roles, loading, error, replace } = useEmployeeList(token)
  const [deactivating, setDeactivating] = useState<Employee | null>(null)
  const [editing, setEditing] = useState<{ employee: Employee; matrix: PermissionsMatrix } | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [roleId, setRoleId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const defaultRoleId = roles.find((role) => role.key === 'fiscal')?.id ?? roles[0]?.id ?? null
  const selectedRoleId = roleId ?? defaultRoleId

  async function handleConfirmDeactivation(employee: Employee) {
    if (!token) return
    replace(await deactivateEmployee(token, employee.id))
    setDeactivating(null)
  }

  async function handleChangeRole(employee: Employee, newRoleId: number) {
    if (!token) return
    setActionError(null)
    try {
      replace(await changeEmployeeRole(token, employee.id, newRoleId))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao trocar o cargo.')
    }
  }

  async function handleEditPermissions(employee: Employee) {
    if (!token) return
    setActionError(null)
    try {
      setEditing({ employee, matrix: await fetchPermissions(token) })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao carregar as permissões.')
    }
  }

  async function handleSaveOverrides(employee: Employee, overrides: Overrides) {
    if (!token) return
    replace(await setEmployeeOverrides(token, employee.id, overrides))
    setEditing(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token || selectedRoleId === null) return
    setSending(true)
    setFormError(null)
    setCreated(null)
    try {
      const newEmployee = await createEmployee(token, {
        username,
        full_name: fullName,
        temporary_password: temporaryPassword,
        role_id: selectedRoleId,
      })
      setEmployees((current) => [...current, newEmployee])
      setCreated(
        `Funcionário ${newEmployee.full_name} (usuário "${newEmployee.username}") cadastrado. ` +
          'Informe a senha temporária a ele — no primeiro login, ele mesmo vai trocá-la.',
      )
      setUsername('')
      setFullName('')
      setTemporaryPassword('')
      setRoleId(null)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Erro inesperado ao cadastrar o funcionário.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page page-wide">
      <h1>Funcionários</h1>
      <p className="subtitle">
        Cadastre novos funcionários, defina o cargo de cada um e exclua quem saiu da empresa.
      </p>

      <EmployeesTable
        employees={employees}
        roles={roles}
        loading={loading}
        error={error}
        currentEmployeeId={currentEmployee?.id ?? -1}
        actions={{
          canSetRole: can(permissions, 'employees.set_role'),
          canManagePermissions: can(permissions, 'permissions.manage'),
          canDeactivate: can(permissions, 'employees.deactivate'),
          onChangeRole: handleChangeRole,
          onEditPermissions: handleEditPermissions,
          onDeactivate: setDeactivating,
        }}
      />
      {actionError && <StatusMessage tone="error">{actionError}</StatusMessage>}

      {deactivating && (
        <DeactivateConfirmation
          employee={deactivating}
          onCancel={() => setDeactivating(null)}
          onConfirm={handleConfirmDeactivation}
        />
      )}

      {editing && (
        <OverridesEditor
          employee={editing.employee}
          matrix={editing.matrix}
          onCancel={() => setEditing(null)}
          onSave={handleSaveOverrides}
        />
      )}

      {can(permissions, 'employees.create') && (
        <>
          <h2>Cadastrar novo funcionário</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label htmlFor="new-username">Usuário</label>
            <input
              id="new-username"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={sending}
            />

            <label htmlFor="new-full-name">Nome completo</label>
            <input
              id="new-full-name"
              type="text"
              autoComplete="off"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={sending}
            />

            <label htmlFor="new-temp-password">Senha temporária</label>
            <input
              id="new-temp-password"
              type="text"
              autoComplete="off"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              disabled={sending}
            />
            <p className="hint">
              Pelo menos {MIN_LENGTH} caracteres. Repasse ao funcionário fora do sistema.
            </p>

            <label htmlFor="new-role">Cargo</label>
            <select
              id="new-role"
              value={selectedRoleId ?? ''}
              onChange={(event) => setRoleId(Number(event.target.value))}
              disabled={sending}
            >
              {roles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {can(permissions, 'permissions.manage') && (
              <p className="hint">
                Cada cargo abre só as ações que precisa. Veja e edite em{' '}
                <Link to="/permissoes">Permissões por cargo</Link>.
              </p>
            )}

            {formError && <StatusMessage tone="error">{formError}</StatusMessage>}
            {created && <StatusMessage tone="success">{created}</StatusMessage>}

            <button
              type="submit"
              className="primary"
              disabled={sending || !username || !fullName || temporaryPassword.length < MIN_LENGTH}
            >
              {sending ? 'Cadastrando…' : 'Cadastrar'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
