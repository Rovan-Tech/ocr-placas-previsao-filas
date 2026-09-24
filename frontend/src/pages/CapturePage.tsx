import { useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import ManualPlateEntry from '../components/ManualPlateEntry'
import OcrResult from '../components/OcrResult'
import { uploadPlateImage, type ManualPlateContext, type OcrUploadResponse } from '../services/api'

type Status = 'idle' | 'reviewing_photo' | 'sending' | 'needs_decision' | 'confirmed' | 'error'

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
              <p className="message" role="status">
                A foto ficou nítida e a placa está legível?
              </p>
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
            <p className="message" role="status">
              <strong>EM PROCESSAMENTO</strong>
              <br />
              Lendo a placa…
            </p>
          )}

          {status === 'error' && photo && (
            <>
              <p className="message error" role="alert">
                {error}
              </p>
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
              <p className="message warning" role="alert">
                Não foi possível confirmar a placa por essa foto. Tire outra foto ou digite a
                placa manualmente — a leitura incerta não é registrada sozinha.
              </p>
              <div className="camera-actions">
                <button type="button" className="primary" onClick={reset}>
                  Tirar outra foto
                </button>
                <button type="button" onClick={() => openManualEntry(true)}>
                  Digitar manualmente
                </button>
              </div>
            </>
          )}

          {status === 'confirmed' && result && (
            <>
              <OcrResult result={result} />
              {result.audit_saved === false && (
                <p className="message warning" role="alert">
                  A placa foi confirmada, mas não foi possível guardar a foto de resguardo desta vez.
                </p>
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
            </>
          )}
        </div>
      )}
    </section>
  )
}
