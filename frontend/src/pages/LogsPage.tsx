import { useCallback, useEffect, useState } from 'react'
import { fetchLogPhoto, fetchLogs, type UploadLogEntry } from '../services/api'
import { formatPlate, plateFormatLabel } from '../services/plate'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
const ENDPOINT_LABEL: Record<UploadLogEntry['endpoint'], string> = {
  upload: 'Foto (OCR)',
  manual: 'Digitação manual',
}

function PhotoLink({ logId }: { logId: number }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function open() {
    try {
      const blob = await fetchLogPhoto(logId)
      setPhotoUrl(URL.createObjectURL(blob))
    } catch {
      setError(true)
    }
  }

  if (photoUrl) {
    return (
      <a href={photoUrl} target="_blank" rel="noreferrer">
        ver foto
      </a>
    )
  }
  return (
    <button type="button" className="link" onClick={open}>
      {error ? 'falhou, tentar de novo' : 'abrir foto'}
    </button>
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<UploadLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchLogs()
      .then((data) => {
        setLogs(data)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao carregar os logs.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => load(), [load])

  function handleRefresh() {
    setLoading(true)
    setError(null)
    load()
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Logs</h1>
          <p className="subtitle">Quem enviou cada foto ou placa, de onde, e o que a leitura deu.</p>
        </div>
        <button type="button" onClick={handleRefresh} disabled={loading}>
          Atualizar
        </button>
      </div>

      {loading && <p className="message">Carregando…</p>}
      {!loading && error && <p className="message error">{error}</p>}
      {!loading && !error && logs.length === 0 && <p className="message">Nenhum registro ainda.</p>}

      {!loading && !error && logs.length > 0 && (
        <div className="table-scroll">
          <table className="checkins">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Funcionário</th>
                <th>Origem</th>
                <th>Placa</th>
                <th>IP</th>
                <th>Foto</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td data-label="Quando">{dateFormatter.format(new Date(log.created_at))}</td>
                  <td data-label="Funcionário">{log.employee_username}</td>
                  <td data-label="Origem">{ENDPOINT_LABEL[log.endpoint]}</td>
                  <td data-label="Placa">
                    {log.final_plate ? (
                      <>
                        <span className="plate">{formatPlate(log.final_plate, log.final_plate_format)}</span>
                        {log.needs_review && ' · incerta'}
                      </>
                    ) : (
                      '—'
                    )}
                    {log.final_plate_format && (
                      <div className="hint">{plateFormatLabel(log.final_plate_format)}</div>
                    )}
                  </td>
                  <td data-label="IP">{log.client_ip ?? '—'}</td>
                  <td data-label="Foto">{log.has_photo ? <PhotoLink logId={log.id} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
