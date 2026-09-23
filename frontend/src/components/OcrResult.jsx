export default function OcrResult({ result }) {
  const detections = result.detections ?? []

  if (detections.length === 0) {
    return (
      <p className="message warning">
        Nenhum texto foi lido na imagem. Tente de novo, mais perto e com a placa bem iluminada.
      </p>
    )
  }

  const best = detections.reduce((a, b) => (b.confidence > a.confidence ? b : a))

  return (
    <div className="ocr-result">
      <span className="label">Placa lida</span>
      <strong className="plate">{best.text}</strong>
      <span className="confidence">Confiança: {(best.confidence * 100).toFixed(1)}%</span>

      {detections.length > 1 && (
        <details>
          <summary>Todos os trechos detectados ({detections.length})</summary>
          <ul>
            {detections.map((detection, index) => (
              <li key={index}>
                {detection.text} — {(detection.confidence * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
