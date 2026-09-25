import { useState } from 'react'
import {
  ApiError,
  createCheckin,
  fetchScheduleDriverDocumentPhotoBack,
  fetchScheduleDriverDocumentPhotoFront,
  type CheckinContext,
  type OcrUploadResponse,
  type VehicleData,
} from '../services/api'
import {
  cargoCategoryLabel,
  formatConfidence,
  formatPlate,
  formatScheduledDate,
  plateFormatLabel,
  scheduleStatusInfo,
  verificationInfo,
} from '../services/plate'
import StatusMessage from './StatusMessage'

interface OcrResultProps {
  result: OcrUploadResponse
}

function VehicleDataSummary({ data, label }: { data: VehicleData; label: string }) {
  const parts = [data.brand, data.model, data.year, data.color, data.uf].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <span className="meta">
      {label}: {parts.join(' · ')}
    </span>
  )
}

function MockDataNotice({ checkin }: { checkin: CheckinContext | null }) {
  if (!checkin?.vehicle_data?.is_mock) return null
  return (
    <div className="verification" role="note">
      <VehicleDataSummary data={checkin.vehicle_data} label="Veículo" />
      <span className="hint">
        Dados de exemplo — em produção, a busca seria feita na API oficial do governo.
      </span>
    </div>
  )
}

async function openDriverDocumentPhoto(scheduleId: number, side: 'front' | 'back') {
  const preview = window.open('', '_blank')
  try {
    const blob =
      side === 'front'
        ? await fetchScheduleDriverDocumentPhotoFront(scheduleId)
        : await fetchScheduleDriverDocumentPhotoBack(scheduleId)
    if (preview) preview.location.href = URL.createObjectURL(blob)
  } catch {
    preview?.close()
  }
}

function EarlyArrivalNotice({ scheduledDate }: { scheduledDate: string }) {
  return (
    <StatusMessage tone="warning">
      Motorista chegou adiantado! O agendamento era para {formatScheduledDate(scheduledDate)}.
    </StatusMessage>
  )
}

function CheckinSection({ checkin }: { checkin: CheckinContext }) {
  if (checkin.schedule) {
    const status = scheduleStatusInfo(checkin.schedule.status)
    return (
      <>
        {checkin.schedule.status === 'early' && <EarlyArrivalNotice scheduledDate={checkin.schedule.scheduled_date} />}
        <div className={`verification tone-${status.tone}`} role="status" aria-live="polite">
          <strong>{status.label}</strong>
          <span>
            Motorista: {checkin.schedule.driver_name} ({checkin.schedule.driver_document})
          </span>
          <span>
            {checkin.schedule.driver_document_validated ? '✅' : '⚠️'} {checkin.schedule.driver_document_validation_detail}
          </span>
          <button type="button" className="link" onClick={() => openDriverDocumentPhoto(checkin.schedule!.id, 'front')}>
            Ver frente do documento
          </button>{' '}
          <button type="button" className="link" onClick={() => openDriverDocumentPhoto(checkin.schedule!.id, 'back')}>
            Ver verso do documento
          </button>
          <span>
            Carga:{' '}
            {checkin.schedule.cargo_items
              .map((item) => `${item.product_name} (${cargoCategoryLabel(item.category)})`)
              .join(', ')}
          </span>
          <span>Data agendada: {formatScheduledDate(checkin.schedule.scheduled_date)}</span>
          {checkin.vehicle_data && !checkin.vehicle_data.is_mock && (
            <VehicleDataSummary data={checkin.vehicle_data} label="Confirmação do veículo" />
          )}
        </div>
      </>
    )
  }

  if (checkin.vehicle_data) {
    return (
      <div className="verification tone-warning" role="status" aria-live="polite">
        <strong>Sem agendamento cadastrado</strong>
        <span>Veículo encontrado na consulta externa — confira manualmente antes de liberar a entrada.</span>
        {!checkin.vehicle_data.is_mock && <VehicleDataSummary data={checkin.vehicle_data} label="Veículo" />}
      </div>
    )
  }

  return (
    <StatusMessage tone="warning">
      Placa não reconhecida em nenhuma fonte — sem agendamento e sem retorno da consulta externa de
      veículo.
    </StatusMessage>
  )
}

function EntryDecision({
  plate,
  scheduleId,
  checkinId,
  canDecide,
}: {
  plate: string
  scheduleId: number | null
  checkinId: number | null
  canDecide: boolean
}) {
  const [decision, setDecision] = useState<'admitted' | 'cancelled' | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(status: 'admitted' | 'cancelled') {
    setSending(true)
    setError(null)
    try {
      await createCheckin(plate, status, scheduleId, checkinId)
      setDecision(status)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado ao registrar a decisão.')
    } finally {
      setSending(false)
    }
  }

  if (decision) {
    return (
      <StatusMessage tone="info">
        {decision === 'admitted' ? 'Entrada autorizada.' : 'Entrada recusada.'}
      </StatusMessage>
    )
  }

  if (!canDecide) {
    return (
      <div className="camera-actions">
        <StatusMessage tone="review">
          Cadastre motorista, carga e caminhão abaixo para poder autorizar ou recusar a entrada.
        </StatusMessage>
      </div>
    )
  }

  return (
    <div className="camera-actions">
      <button type="button" className="primary" onClick={() => decide('admitted')} disabled={sending}>
        Autorizar entrada
      </button>
      <button type="button" onClick={() => decide('cancelled')} disabled={sending}>
        Recusar entrada
      </button>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </div>
  )
}

function RawDetections({ result }: OcrResultProps) {
  if (result.detections.length === 0) return null
  return (
    <details>
      <summary>Textos lidos pelo OCR ({result.detections.length})</summary>
      <ul>
        {result.detections.map((detection, index) => (
          <li key={index}>
            {detection.text} — {formatConfidence(detection.confidence)}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function OcrResult({ result }: OcrResultProps) {
  if (result.plate === null) {
    return (
      <div className="ocr-result">
        <StatusMessage tone="warning">
          Nenhuma placa em formato válido foi lida. Tire outra foto, mais perto e com a placa bem
          iluminada, ou confira a placa manualmente.
        </StatusMessage>
        <RawDetections result={result} />
      </div>
    )
  }

  const verification = result.verification ? verificationInfo(result.verification.status) : null

  return (
    <div className="ocr-result">
      <span className="label">Placa lida</span>
      <strong className="plate">{formatPlate(result.plate, result.plate_format)}</strong>
      <span className="meta">
        {plateFormatLabel(result.plate_format)}
        {result.confidence !== null && <> · Confiança: {formatConfidence(result.confidence)}</>}
      </span>

      {result.needs_review && (
        <StatusMessage tone="review">
          Leitura incerta: confira a placa no veículo antes de liberar a entrada.
        </StatusMessage>
      )}

      <MockDataNotice checkin={result.checkin} />

      {result.verification && verification && result.verification.status !== 'not_checked' && (
        <div
          className={`verification tone-${verification.tone}`}
          role={verification.blocksEntry ? 'alert' : 'status'}
          aria-live={verification.blocksEntry ? 'assertive' : 'polite'}
        >
          <strong>{verification.label}</strong>
          <span>{result.verification.detail}</span>
          {result.verification.source && <span className="source">Fonte: {result.verification.source}</span>}
        </div>
      )}

      {result.checkin && <CheckinSection checkin={result.checkin} />}

      {result.checkin && (
        <EntryDecision
          plate={result.plate}
          scheduleId={result.checkin.schedule?.id ?? null}
          checkinId={result.checkin.checkin_id}
          canDecide={result.checkin.schedule !== null}
        />
      )}

      <RawDetections result={result} />
    </div>
  )
}
