import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, createSchedule, listSchedules, type ScheduleOut } from '../services/api'
import { formatScheduledDate } from '../services/plate'

const MAX_PLATE_LENGTH = 8

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
              <td>
                {schedule.has_driver_document_photo && schedule.has_vehicle_document_photo
                  ? 'Motorista e veículo'
                  : schedule.has_driver_document_photo
                    ? 'Só motorista'
                    : schedule.has_vehicle_document_photo
                      ? 'Só veículo'
                      : 'Nenhum'}
              </td>
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

  const [plate, setPlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverDocument, setDriverDocument] = useState('')
  const [cargoType, setCargoType] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [driverDocumentPhoto, setDriverDocumentPhoto] = useState<File | null>(null)
  const [vehicleDocumentPhoto, setVehicleDocumentPhoto] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setFormError(null)
    setCreated(null)
    try {
      const schedule = await createSchedule({
        plate,
        driverName,
        driverDocument,
        cargoType,
        scheduledDate,
        driverDocumentPhoto,
        vehicleDocumentPhoto,
      })
      setSchedules((current) => [schedule, ...current])
      setCreated(`Agendamento da placa ${schedule.plate} cadastrado para ${formatScheduledDate(schedule.scheduled_date)}.`)
      setPlate('')
      setDriverName('')
      setDriverDocument('')
      setCargoType('')
      setScheduledDate('')
      setDriverDocumentPhoto(null)
      setVehicleDocumentPhoto(null)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro inesperado ao cadastrar o agendamento.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page">
      <h1>Agendamentos</h1>
      <p className="subtitle">Cadastre a chegada prevista de um caminhão para cruzar com a placa lida no check-in.</p>

      <SchedulesTable schedules={schedules} loading={loadingList} error={listError} />

      <h2>Cadastrar agendamento</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="schedule-plate">Placa</label>
        <input
          id="schedule-plate"
          type="text"
          autoComplete="off"
          maxLength={MAX_PLATE_LENGTH}
          value={plate}
          onChange={(event) => setPlate(event.target.value.toUpperCase())}
          disabled={sending}
        />

        <label htmlFor="schedule-driver-name">Nome do motorista</label>
        <input
          id="schedule-driver-name"
          type="text"
          autoComplete="off"
          value={driverName}
          onChange={(event) => setDriverName(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="schedule-driver-document">Documento do motorista</label>
        <input
          id="schedule-driver-document"
          type="text"
          autoComplete="off"
          value={driverDocument}
          onChange={(event) => setDriverDocument(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="schedule-cargo-type">Tipo de carga</label>
        <input
          id="schedule-cargo-type"
          type="text"
          autoComplete="off"
          value={cargoType}
          onChange={(event) => setCargoType(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="schedule-date">Data prevista</label>
        <input
          id="schedule-date"
          type="date"
          value={scheduledDate}
          onChange={(event) => setScheduledDate(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="schedule-driver-photo">Foto do documento do motorista (opcional)</label>
        <input
          id="schedule-driver-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setDriverDocumentPhoto(event.target.files?.[0] ?? null)}
          disabled={sending}
        />

        <label htmlFor="schedule-vehicle-photo">Foto do documento do veículo (opcional)</label>
        <input
          id="schedule-vehicle-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setVehicleDocumentPhoto(event.target.files?.[0] ?? null)}
          disabled={sending}
        />
        <p className="hint">Use só dados de exemplo — nunca documentos reais.</p>

        {formError && (
          <p className="message error" role="alert">
            {formError}
          </p>
        )}
        {created && (
          <p className="message" role="status">
            {created}
          </p>
        )}

        <button
          type="submit"
          className="primary"
          disabled={sending || !plate || !driverName || !driverDocument || !cargoType || !scheduledDate}
        >
          {sending ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </form>
    </section>
  )
}
