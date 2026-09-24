import type { OcrUploadResponse } from '../services/api'
import { formatConfidence, formatPlate, plateFormatLabel, verificationInfo } from '../services/plate'

interface OcrResultProps {
  result: OcrUploadResponse
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

      <RawDetections result={result} />
    </div>
  )
}
