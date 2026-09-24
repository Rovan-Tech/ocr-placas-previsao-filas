import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchRecentCheckins, type Checkin } from '../services/api'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function CheckinsPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchRecentCheckins()
      .then((data) => {
        setCheckins(Array.isArray(data) ? data : (data?.items ?? []))
        setError(null)
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? 'O endpoint de check-ins (GET /checkins) ainda não existe no backend.'
            : err instanceof Error
              ? err.message
              : 'Erro inesperado ao carregar os check-ins.',
        )
      })
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
          <h1>Check-ins recentes</h1>
          <p className="subtitle">Últimos caminhões registrados na guarita.</p>
        </div>
        <button type="button" onClick={handleRefresh} disabled={loading}>
          Atualizar
        </button>
      </div>

      {loading && <p className="message">Carregando…</p>}
      {!loading && error && <p className="message error">{error}</p>}
      {!loading && !error && checkins.length === 0 && (
        <p className="message">Nenhum check-in registrado ainda.</p>
      )}

      {!loading && !error && checkins.length > 0 && (
        <div className="table-scroll">
          <table className="checkins">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Entrada</th>
                <th>Espera estimada</th>
              </tr>
            </thead>
            <tbody>
              {checkins.map((checkin) => (
                <tr key={checkin.id}>
                  <td className="plate">{checkin.plate}</td>
                  <td>{checkin.created_at ? dateFormatter.format(new Date(checkin.created_at)) : '—'}</td>
                  <td>
                    {checkin.estimated_wait_minutes != null
                      ? `${Math.round(checkin.estimated_wait_minutes)} min`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
