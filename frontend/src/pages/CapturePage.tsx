import { useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import ManualPlateEntry from '../components/ManualPlateEntry'
import OcrResult from '../components/OcrResult'
import ScheduleForm from '../components/ScheduleForm'
import StatusMessage from '../components/StatusMessage'
import { uploadPlateImage, type ManualPlateContext, type OcrUploadResponse, type ScheduleOut } from '../services/api'
import { todayIsoDate } from '../services/plate'

type Status = 'idle' | 'reviewing_photo' | 'sending' | 'needs_decision' | 'confirmed' | 'error'

function UnscheduledArrivalRegistration({
  plate,
  onRegistered,
}: {
  plate: string
  onRegistered: (schedule: ScheduleOut) => void
}) {
  const [registering, setRegistering] = useState(false)

  if (!registering) {
    return (
      <p className="manual-entry-link">
        <button type="button" className="link" onClick={() => setRegistering(true)}>
          Cadastrar motorista, carga e caminhão
        </button>
      </p>
    )
  }

  return (
    <>
      <h2>Cadastrar chegada sem agendamento</h2>
      <ScheduleForm
        idPrefix="arrival"
        initialPlate={plate}
        initialScheduledDate={todayIsoDate()}
        plateReadOnly
        onCreated={onRegistered}
      />
    </>
  )
}

export default function CapturePage() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<OcrUploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualEntry, setManualEntry] = useState(false)
  const [manualContext, setManualContext] = useState<ManualPlateContext>({})

  function showPreview(file: File | null) {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return file ? URL.createObjectURL(file) : null
    })
  }

  function handleCapture(file: File) {
    showPreview(file)
    setPhoto(file)
    setResult(null)
    setError(null)
    setManualEntry(false)
    setStatus('reviewing_photo')
  }

  async function sendToOcr(file: File) {
    setError(null)
    setStatus('sending')
    try {
      const response = await uploadPlateImage(file)
      setResult(response)
      setStatus(response.plate !== null && !response.needs_review ? 'confirmed' : 'needs_decision')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao ler a placa.')
      setStatus('error')
    }
  }

  function handleManualResult(response: OcrUploadResponse) {
    setResult(response)
    setManualEntry(false)
    setStatus('confirmed')
  }

  function handleScheduleRegistered(schedule: ScheduleOut) {
    setResult((current) =>
      current && current.checkin
        ? {
            ...current,
            checkin: {
              ...current.checkin,
              found: true,
              schedule: {
                id: schedule.id,
                driver_name: schedule.driver_name,
                driver_document: schedule.driver_document,
                driver_document_validated: schedule.driver_document_validated,
                driver_document_validation_detail: schedule.driver_document_validation_detail,
                cargo_items: schedule.cargo_items,
                scheduled_date: schedule.scheduled_date,
                status: 'on_time',
              },
            },
          }
        : current,
    )
  }

  function openManualEntry(withPhotoContext: boolean) {
    setManualContext(
      withPhotoContext && photo
        ? { photo, ocrPlate: result?.plate ?? null, ocrConfidence: result?.confidence ?? null }
        : {},
    )
    setManualEntry(true)
  }

  function reset() {
    showPreview(null)
    setPhoto(null)
    setResult(null)
    setError(null)
    setManualEntry(false)
    setStatus('idle')
  }

  if (manualEntry) {
    return (
      <section className="page">
        <h1>Digitar a placa</h1>
        <p className="subtitle">Use quando a câmera não conseguir ler a placa, ou se preferir digitar direto.</p>
        <ManualPlateEntry onSubmit={handleManualResult} onCancel={() => setManualEntry(false)} context={manualContext} />
      </section>
    )
  }

  return (
    <section className="page">
      <h1>Capturar placa</h1>
      <p className="subtitle">Fotografe a placa do caminhão para registrar o check-in.</p>

      {status === 'idle' && (
        <>
          <CameraCapture onCapture={handleCapture} />
          <p className="manual-entry-link">
            Câmera não está funcionando?{' '}
            <button type="button" className="link" onClick={() => openManualEntry(false)}>
              Digitar a placa manualmente
            </button>
          </p>
        </>
      )}

      {status !== 'idle' && (photo || result) && (
        <div className="capture-review">
          {previewUrl && <img src={previewUrl} alt="Foto tirada da placa" />}

          {status === 'reviewing_photo' && photo && (
            <>
              <StatusMessage tone="info">A foto ficou nítida e a placa está legível?</StatusMessage>
              <div className="camera-actions">
                <button type="button" className="primary" onClick={() => sendToOcr(photo)}>
                  Sim, continuar
                </button>
                <button type="button" onClick={reset}>
                  Não, tirar outra
                </button>
              </div>
              <p className="manual-entry-link">
                <button type="button" className="link" onClick={() => openManualEntry(true)}>
                  Prefiro digitar a placa
                </button>
              </p>
            </>
          )}

          {status === 'sending' && (
            <StatusMessage tone="info">
              <strong>EM PROCESSAMENTO</strong>
              <br />
              Lendo a placa…
            </StatusMessage>
          )}

          {status === 'error' && photo && (
            <>
              <StatusMessage tone="error">{error}</StatusMessage>
              <div className="camera-actions">
                <button type="button" className="primary" onClick={() => sendToOcr(photo)}>
                  Tentar novamente
                </button>
                <button type="button" onClick={() => openManualEntry(true)}>
                  Digitar manualmente
                </button>
              </div>
            </>
          )}

          {status === 'needs_decision' && result && (
            <>
              <OcrResult result={result} />
              <StatusMessage tone="warning">
                Não foi possível confirmar a placa por essa foto. Tire outra foto ou digite a
                placa manualmente — a leitura incerta não é registrada sozinha.
              </StatusMessage>
              <div className="camera-actions">
                <button type="button" className="primary" onClick={reset}>
                  Tirar outra foto
                </button>
                <button type="button" onClick={() => openManualEntry(true)}>
                  Digitar manualmente
                </button>
              </div>
              {result.plate && result.checkin && !result.checkin.schedule && (
                <UnscheduledArrivalRegistration plate={result.plate} onRegistered={handleScheduleRegistered} />
              )}
            </>
          )}

          {status === 'confirmed' && result && (
            <>
              <OcrResult result={result} />
              {result.audit_saved === false && (
                <StatusMessage tone="warning">
                  A placa foi confirmada, mas não foi possível guardar a foto de resguardo desta vez.
                </StatusMessage>
              )}
              <p className="manual-entry-link">
                Não é essa placa?{' '}
                <button type="button" className="link" onClick={() => openManualEntry(false)}>
                  Digitar manualmente
                </button>
              </p>
              <div className="camera-actions">
                <button type="button" onClick={reset}>
                  Nova foto
                </button>
              </div>
              {result.plate && result.checkin && !result.checkin.schedule && (
                <UnscheduledArrivalRegistration plate={result.plate} onRegistered={handleScheduleRegistered} />
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
