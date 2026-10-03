import { Image, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchLogPhoto, fetchLogs, type UploadLogEntry } from '../services/api'
import { formatPlate, logOriginInfo, plateFormatLabel } from '../services/plate'

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
})
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function OriginBadge({ endpoint }: Readonly<{ endpoint: UploadLogEntry['endpoint'] }>) {
  const { label, tone } = logOriginInfo(endpoint)
  return <span className={`status-badge status-badge-${tone}`}>{label}</span>
}

function PhotoLink({ logId }: Readonly<{ logId: number }>) {
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
      <a href={photoUrl} target="_blank" rel="noreferrer" className="photo-link">
        <Image aria-hidden="true" size={16} />
        ver foto
      </a>
    )
  }
  return (
    <button type="button" className="link photo-link" onClick={open}>
      <Image aria-hidden="true" size={16} />
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
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar os logs.'),
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => load(), [load])

  function handleRefresh() {
    setLoading(true)
    setError(null)
    load()
  }

  return (
    <section className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Logs</h1>
          <p className="subtitle">
            Quem enviou cada foto ou placa, de onde, e o que a leitura deu.
          </p>
        </div>
        <button type="button" className="refresh-button" onClick={handleRefresh} disabled={loading}>
          <RefreshCw aria-hidden="true" size={18} />
          Atualizar
        </button>
      </div>

      {loading && <p className="message">Carregando…</p>}
      {!loading && error && <p className="message error">{error}</p>}
      {!loading && !error && logs.length === 0 && <p className="message">Nenhum registro ainda.</p>}

      {!loading && !error && logs.length > 0 && (
        <div className="table-scroll">
          <table className="checkins logs">
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
                  <td data-label="Quando" className="mono">
                    <time
                      dateTime={log.created_at}
                      title={fullDateFormatter.format(new Date(log.created_at))}
                    >
                      {shortDateFormatter.format(new Date(log.created_at))}
                    </time>
                  </td>
                  <td data-label="Funcionário">{log.employee_username}</td>
                  <td data-label="Origem">
                    <OriginBadge endpoint={log.endpoint} />
                  </td>
                  <td data-label="Placa">
                    {log.final_plate ? (
                      <div className="plate-line">
                        <span className="plate">
                          {formatPlate(log.final_plate, log.final_plate_format)}
                        </span>
                        {log.needs_review && <span className="uncertain-mark">incerta</span>}
                      </div>
                    ) : (
                      '—'
                    )}
                    {log.final_plate_format && (
                      <div className="hint">{plateFormatLabel(log.final_plate_format)}</div>
                    )}
                  </td>
                  <td data-label="IP" className="mono">
                    {log.client_ip ?? '—'}
                  </td>
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
