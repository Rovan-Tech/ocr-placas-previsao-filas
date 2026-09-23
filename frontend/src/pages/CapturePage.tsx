import { useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import OcrResult from '../components/OcrResult'
import { uploadPlateImage, type OcrUploadResponse } from '../services/api'

type Status = 'idle' | 'sending' | 'done' | 'error'

export default function CapturePage() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<OcrUploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function showPreview(file: File | null) {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return file ? URL.createObjectURL(file) : null
    })
  }

  async function handleCapture(file: File) {
    if (file !== photo) showPreview(file)
    setPhoto(file)
    setResult(null)
    setError(null)
    setStatus('sending')
    try {
      setResult(await uploadPlateImage(file))
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao ler a placa.')
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
          {status === 'done' && result && <OcrResult result={result} />}

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
