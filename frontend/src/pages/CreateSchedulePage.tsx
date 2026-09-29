import { useCallback, useEffect, useState } from 'react'
import ScheduleForm from '../components/ScheduleForm'
import { useAuth } from '../context/AuthContext'
import { listSchedules, type ScheduleOut } from '../services/api'
import { cargoCategoryLabel, documentStatusInfo, formatScheduledDate } from '../services/plate'
import { can } from '../services/roles'

function cargoSummary(schedule: ScheduleOut): string {
  return schedule.cargo_items
    .map((item) => `${item.product_name} (${cargoCategoryLabel(item.category)})`)
    .join(', ')
}

function DocumentBadge({ isValidated }: { isValidated: boolean }) {
  const { label, tone } = documentStatusInfo(isValidated)
  return <span className={`status-badge status-badge-${tone}`}>{label}</span>
}

function SchedulesTable({
  schedules,
  loading,
  error,
}: {
  schedules: ScheduleOut[]
  loading: boolean
  error: string | null
}) {
  if (loading) return <p className="message">Carregando…</p>
  if (error) return <p className="message error">{error}</p>
  if (schedules.length === 0) return <p className="message">Nenhum agendamento cadastrado ainda.</p>

  return (
    <div className="table-scroll">
      <table className="checkins schedules">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Motorista</th>
            <th>Carga</th>
            <th>Origem → Destino</th>
            <th>Data prevista</th>
            <th>Documento</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id}>
              <td className="plate" data-label="Placa">
                {schedule.plate}
              </td>
              <td data-label="Motorista">{schedule.driver_name}</td>
              <td data-label="Carga">{cargoSummary(schedule)}</td>
              <td data-label="Origem → Destino">
                {schedule.origin_location} → {schedule.destination_location}
              </td>
              <td data-label="Data prevista">{formatScheduledDate(schedule.scheduled_date)}</td>
              <td data-label="Documento">
                <DocumentBadge isValidated={schedule.driver_document_validated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CreateSchedulePage() {
  const { employee } = useAuth()
  const canView = can(employee?.permissions, 'schedules.view')
  const canCreate = can(employee?.permissions, 'schedules.create')
  const [schedules, setSchedules] = useState<ScheduleOut[]>([])
  const [loadingList, setLoadingList] = useState(canView)
  const [listError, setListError] = useState<string | null>(null)

  const loadSchedules = useCallback(() => {
    if (!canView) return
    listSchedules()
      .then((data) => {
        setSchedules(data)
        setListError(null)
      })
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos.'),
      )
      .finally(() => setLoadingList(false))
  }, [canView])

  useEffect(() => loadSchedules(), [loadSchedules])

  return (
    <section className="page page-wide">
      <h1>Agendamentos</h1>
      <p className="subtitle">
        Cadastre a chegada prevista de um caminhão para cruzar com a placa lida no check-in.
      </p>

      <div className="schedules-layout">
        {canView && (
          <SchedulesTable schedules={schedules} loading={loadingList} error={listError} />
        )}

        {canCreate && (
          <aside className="schedules-form-panel">
            <h2>Cadastrar agendamento</h2>
            <ScheduleForm
              onCreated={(schedule) => setSchedules((current) => [schedule, ...current])}
            />
          </aside>
        )}
      </div>
    </section>
  )
}
