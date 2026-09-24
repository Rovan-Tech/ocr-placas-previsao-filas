import type { CheckinContext, OcrUploadResponse, VehicleData } from '../services/api'
import { formatConfidence, formatPlate, formatScheduledDate, plateFormatLabel, scheduleStatusInfo, verificationInfo } from '../services/plate'

interface OcrResultProps {
  result: OcrUploadResponse
}

function VehicleDataSummary({ data, label }: { data: VehicleData; label: string }) {
  const parts = [data.brand, data.model, data.year, data.color, data.uf].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <>
      <span className="meta">
        {label}: {parts.join(' · ')}
      </span>
      {data.is_mock && (
        <span className="hint">
          Dados de exemplo — em produção, a busca seria feita na API oficial do governo.
        </span>
      )}
    </>
  )
}

function CheckinSection({ checkin }: { checkin: CheckinContext }) {
  if (checkin.schedule) {
    const status = scheduleStatusInfo(checkin.schedule.status)
    return (
      <div className={`verification tone-${status.tone}`} role="status">
        <strong>{status.label}</strong>
        <span>
          Motorista: {checkin.schedule.driver_name} ({checkin.schedule.driver_document})
        </span>
        <span>Carga: {checkin.schedule.cargo_type}</span>
        <span>Data agendada: {formatScheduledDate(checkin.schedule.scheduled_date)}</span>
        {checkin.vehicle_data && <VehicleDataSummary data={checkin.vehicle_data} label="Confirmação do veículo" />}
      </div>
    )
  }

  if (checkin.vehicle_data) {
    return (
      <div className="verification tone-warning" role="status">
        <strong>Sem agendamento cadastrado</strong>
        <span>Veículo encontrado na consulta externa — confira manualmente antes de liberar a entrada.</span>
        <VehicleDataSummary data={checkin.vehicle_data} label="Veículo" />
      </div>
    )
  }

  return (
    <p className="message warning" role="alert">
      Placa não reconhecida em nenhuma fonte — sem agendamento e sem retorno da consulta externa de
      veículo.
    </p>
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
        <p className="message warning" role="alert">
          Nenhuma placa em formato válido foi lida. Tire outra foto, mais perto e com a placa bem
          iluminada, ou confira a placa manualmente.
        </p>
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
        <p className="message warning" role="alert">
          Leitura incerta: confira a placa no veículo antes de liberar a entrada.
        </p>
      )}

      {result.verification && verification && (
        <div className={`verification tone-${verification.tone}`} role={verification.blocksEntry ? 'alert' : 'status'}>
          <strong>{verification.label}</strong>
          <span>{result.verification.detail}</span>
          {result.verification.source && <span className="source">Fonte: {result.verification.source}</span>}
        </div>
      )}

      {result.checkin && <CheckinSection checkin={result.checkin} />}

      <RawDetections result={result} />
    </div>
  )
}
