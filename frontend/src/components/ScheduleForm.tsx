import { useState, type FormEvent } from 'react'
import { ApiError, createSchedule, type ScheduleOut } from '../services/api'
import { formatScheduledDate } from '../services/plate'

const MAX_PLATE_LENGTH = 8

interface ScheduleFormProps {
  idPrefix?: string
  initialPlate?: string
  initialScheduledDate?: string
  plateReadOnly?: boolean
  onCreated: (schedule: ScheduleOut) => void
}

export default function ScheduleForm({
  idPrefix = 'schedule',
  initialPlate = '',
  initialScheduledDate = '',
  plateReadOnly = false,
  onCreated,
}: ScheduleFormProps) {
  const [plate, setPlate] = useState(initialPlate)
  const [driverName, setDriverName] = useState('')
  const [driverDocument, setDriverDocument] = useState('')
  const [cargoType, setCargoType] = useState('')
  const [scheduledDate, setScheduledDate] = useState(initialScheduledDate)
  const [driverDocumentPhotoFront, setDriverDocumentPhotoFront] = useState<File | null>(null)
  const [driverDocumentPhotoBack, setDriverDocumentPhotoBack] = useState<File | null>(null)
  const [vehicleDocumentPhoto, setVehicleDocumentPhoto] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

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
        driverDocumentPhotoFront,
        driverDocumentPhotoBack,
        vehicleDocumentPhoto,
      })
      setCreated(`Agendamento da placa ${schedule.plate} cadastrado para ${formatScheduledDate(schedule.scheduled_date)}.`)
      setDriverName('')
      setDriverDocument('')
      setCargoType('')
      setDriverDocumentPhotoFront(null)
      setDriverDocumentPhotoBack(null)
      setVehicleDocumentPhoto(null)
      if (!plateReadOnly) setPlate('')
      onCreated(schedule)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro inesperado ao cadastrar o agendamento.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label htmlFor={`${idPrefix}-plate`}>Placa</label>
      <input
        id={`${idPrefix}-plate`}
        type="text"
        autoComplete="off"
        maxLength={MAX_PLATE_LENGTH}
        value={plate}
        onChange={(event) => setPlate(event.target.value.toUpperCase())}
        disabled={sending || plateReadOnly}
      />

      <label htmlFor={`${idPrefix}-driver-name`}>Nome do motorista</label>
      <input
        id={`${idPrefix}-driver-name`}
        type="text"
        autoComplete="off"
        value={driverName}
        onChange={(event) => setDriverName(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-driver-document`}>Documento do motorista</label>
      <input
        id={`${idPrefix}-driver-document`}
        type="text"
        autoComplete="off"
        value={driverDocument}
        onChange={(event) => setDriverDocument(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-cargo-type`}>Tipo de carga</label>
      <input
        id={`${idPrefix}-cargo-type`}
        type="text"
        autoComplete="off"
        value={cargoType}
        onChange={(event) => setCargoType(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-date`}>Data prevista</label>
      <input
        id={`${idPrefix}-date`}
        type="date"
        value={scheduledDate}
        onChange={(event) => setScheduledDate(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-driver-photo-front`}>Foto do documento do motorista — frente (opcional)</label>
      <input
        id={`${idPrefix}-driver-photo-front`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setDriverDocumentPhotoFront(event.target.files?.[0] ?? null)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-driver-photo-back`}>Foto do documento do motorista — verso (opcional)</label>
      <input
        id={`${idPrefix}-driver-photo-back`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setDriverDocumentPhotoBack(event.target.files?.[0] ?? null)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-photo`}>Foto do documento do veículo (opcional)</label>
      <input
        id={`${idPrefix}-vehicle-photo`}
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
  )
}
