import { useCallback, useEffect, useState } from 'react'
import ScheduleForm from '../components/ScheduleForm'
import { listSchedules, type ScheduleOut } from '../services/api'
import { formatScheduledDate } from '../services/plate'

function documentsSummary(schedule: ScheduleOut): string {
  const parts = []
  if (schedule.has_driver_document_photo_front && schedule.has_driver_document_photo_back) {
    parts.push('motorista (frente e verso)')
  } else if (schedule.has_driver_document_photo_front) {
    parts.push('motorista (só frente)')
  } else if (schedule.has_driver_document_photo_back) {
    parts.push('motorista (só verso)')
  }
  if (schedule.has_vehicle_document_photo) parts.push('veículo')
  return parts.length > 0 ? parts.join(' · ') : 'Nenhum'
}

function SchedulesTable({ schedules, loading, error }: { schedules: ScheduleOut[]; loading: boolean; error: string | null }) {
  if (loading) return <p className="message">Carregando…</p>
  if (error) return <p className="message error">{error}</p>
  if (schedules.length === 0) return <p className="message">Nenhum agendamento cadastrado ainda.</p>

  return (
    <div className="table-scroll">
      <table className="checkins">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Motorista</th>
            <th>Carga</th>
            <th>Data prevista</th>
            <th>Documentos</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id}>
              <td className="plate">{schedule.plate}</td>
              <td>{schedule.driver_name}</td>
              <td>{schedule.cargo_type}</td>
              <td>{formatScheduledDate(schedule.scheduled_date)}</td>
              <td>{documentsSummary(schedule)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CreateSchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleOut[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const loadSchedules = useCallback(() => {
    listSchedules()
      .then((data) => {
        setSchedules(data)
        setListError(null)
      })
      .catch((err: unknown) => setListError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos.'))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => loadSchedules(), [loadSchedules])

  return (
    <section className="page">
      <h1>Agendamentos</h1>
      <p className="subtitle">Cadastre a chegada prevista de um caminhão para cruzar com a placa lida no check-in.</p>

      <SchedulesTable schedules={schedules} loading={loadingList} error={listError} />

      <h2>Cadastrar agendamento</h2>
      <ScheduleForm onCreated={(schedule) => setSchedules((current) => [schedule, ...current])} />
    </section>
  )
}
