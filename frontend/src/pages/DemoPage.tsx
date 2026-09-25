import { useEffect, useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import OcrResult from '../components/OcrResult'
import StatusMessage from '../components/StatusMessage'
import ThemeToggle from '../components/ThemeToggle'
import {
  ApiError,
  demoSampleImageUrl,
  fetchDemoSamples,
  submitDemoOcr,
  type DemoPlateReadResponse,
  type DemoSampleInfo,
  type OcrUploadResponse,
} from '../services/api'

type Status = 'idle' | 'sending' | 'done' | 'error'

function toOcrUploadResponse(demo: DemoPlateReadResponse): OcrUploadResponse {
  return {
    filename: null,
    plate: demo.plate,
    plate_format: demo.plate_format,
    confidence: demo.confidence,
    needs_review: demo.needs_review,
    verification: null,
    detections: demo.detections,
    checkin: null,
  }
}

export default function DemoPage() {
  const [samples, setSamples] = useState<DemoSampleInfo[]>([])
  const [loadingSamples, setLoadingSamples] = useState(true)
  const [samplesError, setSamplesError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<OcrUploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDemoSamples()
      .then((data) => {
        setSamples(data)
        setSamplesError(null)
      })
      .catch((err: unknown) => {
        setSamplesError(err instanceof ApiError ? err.message : 'Erro ao carregar os exemplos.')
      })
      .finally(() => setLoadingSamples(false))
  }, [])

  async function run(input: { sampleId: string } | { file: File }) {
    setStatus('sending')
    setError(null)
    try {
      setResult(toOcrUploadResponse(await submitDemoOcr(input)))
      setStatus('done')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado ao rodar a leitura de demonstração.')
      setStatus('error')
    }
  }

  function reset() {
    setResult(null)
    setError(null)
    setStatus('idle')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>Porto Baía Verde</strong>
          <span>Demonstração pública do OCR de placas</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="app-main">
        <section className="page">
          <h1>Testar o OCR de placas</h1>
          <p className="subtitle">
            Sem necessidade de login. Escolha uma placa de exemplo (sintética, gerada por computador) ou envie
            uma foto sua para ver o reconhecimento funcionando.
          </p>

          <StatusMessage tone="info">
            Modo de demonstração: nada aqui fica gravado como registro de produção. Se você enviar sua própria
            foto, ela é processada só na hora, em memória, e descartada em seguida — não fica salva em disco
            nem associada a nenhuma conta.
          </StatusMessage>

          {status !== 'sending' && (result === null || status === 'error') && (
            <>
              <h2>Escolher uma placa de exemplo</h2>
              {loadingSamples && <p className="message">Carregando exemplos…</p>}
              {samplesError && <StatusMessage tone="error">{samplesError}</StatusMessage>}
              {!loadingSamples && !samplesError && (
                <div className="demo-samples">
                  {samples.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      className="demo-sample"
                      onClick={() => run({ sampleId: sample.id })}
                    >
                      <img src={demoSampleImageUrl(sample.id)} alt={sample.description} />
                      <span>{sample.description}</span>
                    </button>
                  ))}
                </div>
              )}

              <h2>Ou envie sua própria foto</h2>
              <CameraCapture onCapture={(file) => run({ file })} />
            </>
          )}

          {status === 'sending' && (
            <StatusMessage tone="info">
              <strong>EM PROCESSAMENTO</strong>
              <br />
              Lendo a placa…
            </StatusMessage>
          )}

          {status === 'error' && error && <StatusMessage tone="error">{error}</StatusMessage>}

          {status === 'done' && result && (
            <>
              <OcrResult result={result} />
              <div className="camera-actions">
                <button type="button" className="primary" onClick={reset}>
                  Testar outra placa
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
