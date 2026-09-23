import { useState } from 'react'
import CameraCapture from '../components/CameraCapture.jsx'
import OcrResult from '../components/OcrResult.jsx'
import { uploadPlateImage } from '../services/api.js'

export default function CapturePage() {
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [status, setStatus] = useState('idle') // idle | sending | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function showPreview(file) {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return file ? URL.createObjectURL(file) : null
    })
  }

  async function handleCapture(file) {
    if (file !== photo) showPreview(file)
    setPhoto(file)
    setResult(null)
    setError(null)
    setStatus('sending')
    try {
      setResult(await uploadPlateImage(file))
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  function reset() {
    showPreview(null)
    setPhoto(null)
    setResult(null)
    setError(null)
    setStatus('idle')
  }

  return (
    <section className="page">
      <h1>Capturar placa</h1>
      <p className="subtitle">Fotografe a placa do caminhão para registrar o check-in.</p>

      {!photo && <CameraCapture onCapture={handleCapture} disabled={status === 'sending'} />}

      {photo && (
        <div className="capture-review">
          {previewUrl && <img src={previewUrl} alt="Foto enviada da placa" />}

          {status === 'sending' && <p className="message">Lendo a placa…</p>}
          {status === 'error' && <p className="message error">{error}</p>}
          {status === 'done' && <OcrResult result={result} />}

          <div className="camera-actions">
            {status === 'error' && (
              <button type="button" className="primary" onClick={() => handleCapture(photo)}>
                Tentar novamente
              </button>
            )}
            <button type="button" onClick={reset} disabled={status === 'sending'}>
              Nova foto
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
