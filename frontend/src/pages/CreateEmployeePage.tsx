import { useCallback, useEffect, useState, type FormEvent } from 'react'
import StatusMessage from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'
import { createEmployee, deactivateEmployee, listEmployees, type Employee } from '../services/auth'

const MIN_LENGTH = 8

function DeactivateConfirmation({
  employee,
  onCancel,
  onConfirm,
}: {
  employee: Employee
  onCancel: () => void
  onConfirm: (employee: Employee) => Promise<void>
}) {
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
    <div className="verification tone-danger" role="alertdialog" aria-label="Confirmar exclusão de funcionário">
      <strong>Tem certeza que deseja excluir este funcionário?</strong>
      <span>
        Nome: <strong>{employee.full_name}</strong>
      </span>
      <span>
        Usuário: <strong>{employee.username}</strong>
      </span>
      <span>Papel: {employee.is_admin ? 'Admin master' : 'Fiscal'}</span>
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

function EmployeesTable({
  employees,
  loading,
  error,
  currentEmployeeId,
  onSelectForDeactivation,
}: {
  employees: Employee[]
  loading: boolean
  error: string | null
  currentEmployeeId: number
  onSelectForDeactivation: (employee: Employee) => void
}) {
  if (loading) return <p className="message">Carregando…</p>
  if (error) return <StatusMessage tone="error">{error}</StatusMessage>
  if (employees.length === 0) return <p className="message">Nenhum funcionário cadastrado ainda.</p>

  return (
    <div className="table-scroll">
      <table className="checkins">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Usuário</th>
            <th>Papel</th>
            <th>Situação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td data-label="Nome">{employee.full_name}</td>
              <td data-label="Usuário">{employee.username}</td>
              <td data-label="Papel">{employee.is_admin ? 'Admin master' : 'Fiscal'}</td>
              <td data-label="Situação">{employee.active ? 'Ativo' : 'Excluído'}</td>
              <td data-label="">
                {employee.active && employee.id !== currentEmployeeId && (
                  <button type="button" className="link" onClick={() => onSelectForDeactivation(employee)}>
                    Excluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CreateEmployeePage() {
  const { token, employee: currentEmployee } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<Employee | null>(null)

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const loadEmployees = useCallback(() => {
    if (!token) return
    listEmployees(token)
      .then((data) => {
        setEmployees(data)
        setListError(null)
      })
      .catch((err: unknown) => setListError(err instanceof Error ? err.message : 'Erro ao carregar funcionários.'))
      .finally(() => setLoadingList(false))
  }, [token])

  useEffect(() => loadEmployees(), [loadEmployees])

  async function handleConfirmDeactivation(employee: Employee) {
    if (!token) return
    const updated = await deactivateEmployee(token, employee.id)
    setEmployees((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    setDeactivating(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setSending(true)
    setFormError(null)
    setCreated(null)
    try {
      const newEmployee = await createEmployee(token, {
        username,
        full_name: fullName,
        temporary_password: temporaryPassword,
        is_admin: isAdmin,
      })
      setEmployees((current) => [...current, newEmployee])
      setCreated(
        `Funcionário ${newEmployee.full_name} (usuário "${newEmployee.username}") cadastrado. ` +
          'Informe a senha temporária a ele — no primeiro login, ele mesmo vai trocá-la.',
      )
      setUsername('')
      setFullName('')
      setTemporaryPassword('')
      setIsAdmin(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro inesperado ao cadastrar o funcionário.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page">
      <h1>Funcionários</h1>
      <p className="subtitle">Cadastre novos funcionários e exclua quem saiu da empresa.</p>

      <EmployeesTable
        employees={employees}
        loading={loadingList}
        error={listError}
        currentEmployeeId={currentEmployee?.id ?? -1}
        onSelectForDeactivation={setDeactivating}
      />

      {deactivating && (
        <DeactivateConfirmation
          employee={deactivating}
          onCancel={() => setDeactivating(null)}
          onConfirm={handleConfirmDeactivation}
        />
      )}

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
        <p className="hint">Pelo menos {MIN_LENGTH} caracteres. Repasse ao funcionário fora do sistema.</p>

        <label>
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => setIsAdmin(event.target.checked)}
            disabled={sending}
          />{' '}
          Também é admin master (pode cadastrar e excluir outros funcionários)
        </label>

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
    </section>
  )
}
