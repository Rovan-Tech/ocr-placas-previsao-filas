import type { PermissionLogEntry } from '../services/auth'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

export default function PermissionLog({ entries }: { entries: PermissionLogEntry[] }) {
  return (
    <section className="permission-log" aria-label="Histórico de alterações">
      <h2>Histórico de alterações</h2>
      <p className="hint">
        Toda mudança de permissão fica registrada com quem fez, o IP e o horário.
      </p>
      {entries.length === 0 ? (
        <p className="message">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="table-scroll">
          <table className="checkins permission-log-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>IP</th>
                <th>O que mudou</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="Quando" className="mono">
                    <time dateTime={entry.created_at}>
                      {dateFormatter.format(new Date(entry.created_at))}
                    </time>
                  </td>
                  <td data-label="Quem">
                    {entry.actor_name} <span className="hint">({entry.actor_username})</span>
                  </td>
                  <td data-label="IP" className="mono">
                    {entry.client_ip ?? '—'}
                  </td>
                  <td data-label="O que mudou">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
