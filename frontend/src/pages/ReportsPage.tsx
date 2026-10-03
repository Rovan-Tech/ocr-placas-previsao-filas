import { Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchLogs, fetchRecentCheckins } from '../services/api'
import {
  UNCERTAIN_TARGET_PERCENT,
  WAIT_TARGET_MINUTES,
  hourLabel,
  summarizeCheckins,
  uncertainReadingsPercent,
  type ReportSummary,
} from '../services/reports'

const SAMPLE_SIZE = 100
const BAR_MAX_PX = 140
const BAR_MIN_PX = 4
const DENSE_CHART_BUCKETS = 12

interface ReportData {
  summary: ReportSummary
  uncertainPercent: number | null
}

function Kpi({
  title,
  value,
  note,
  noteTone = 'muted',
}: Readonly<{
  title: string
  value: string
  note: string
  noteTone?: 'muted' | 'ok' | 'warning'
}>) {
  return (
    <div className="kpi-card">
      <h2 className="card-title">{title}</h2>
      <p className="kpi-value">{value}</p>
      <p className={`kpi-note kpi-note-${noteTone}`}>{note}</p>
    </div>
  )
}

function HourlyChart({ summary }: Readonly<{ summary: ReportSummary }>) {
  const peak = Math.max(...summary.byHour.map((bucket) => bucket.count), 1)
  const labelStep = summary.byHour.length > DENSE_CHART_BUCKETS ? 2 : 1
  return (
    <div className="report-card">
      <h2 className="card-title">Check-ins por hora</h2>
      <div
        className="hour-chart"
        role="img"
        aria-label={`Check-ins por hora: ${summary.byHour
          .map((bucket) => `${hourLabel(bucket.hour)} ${bucket.count}`)
          .join(', ')}`}
      >
        {summary.byHour.map((bucket, index) => (
          <div className="hour-chart-column" key={bucket.hour}>
            <span className="hour-chart-count">{bucket.count}</span>
            <div
              className="hour-chart-bar"
              style={{
                height: `${bucket.count === 0 ? BAR_MIN_PX : Math.max((bucket.count / peak) * BAR_MAX_PX, BAR_MIN_PX)}px`,
              }}
            />
            <span className="hour-chart-label">
              {index % labelStep === 0 ? hourLabel(bucket.hour) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DecisionTable({ summary }: Readonly<{ summary: ReportSummary }>) {
  return (
    <div className="table-scroll">
      <table className="checkins">
        <thead>
          <tr>
            <th>Decisão</th>
            <th>Quantidade</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Autorizado</td>
            <td className="count-ok">{summary.admitted}</td>
          </tr>
          <tr>
            <td>Aguardando</td>
            <td className="count-warning">{summary.waiting}</td>
          </tr>
          <tr>
            <td>Recusado</td>
            <td className="count-danger">{summary.cancelled}</td>
          </tr>
          <tr>
            <td>Total</td>
            <td>{summary.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function waitNote(averageWaitMinutes: number | null) {
  if (averageWaitMinutes == null) return { text: 'sem dados de espera', tone: 'muted' as const }
  return {
    text:
      averageWaitMinutes > WAIT_TARGET_MINUTES
        ? `acima da meta (${WAIT_TARGET_MINUTES} min)`
        : `meta: até ${WAIT_TARGET_MINUTES} min`,
    tone: averageWaitMinutes > WAIT_TARGET_MINUTES ? ('warning' as const) : ('muted' as const),
  }
}

function ReportKpis({ data }: Readonly<{ data: ReportData }>) {
  const { summary, uncertainPercent } = data
  const wait = waitNote(summary.averageWaitMinutes)
  const change = summary.changeVsYesterdayPercent
  const changeArrow = change != null && change >= 0 ? '↑' : '↓'
  const changeNote =
    change == null ? 'sem dados de ontem' : `${changeArrow} ${Math.abs(change)}% vs. ontem`

  return (
    <div className="kpi-grid">
      <Kpi
        title="Check-ins hoje"
        value={String(summary.total)}
        note={changeNote}
        noteTone={change != null && change >= 0 ? 'ok' : 'muted'}
      />
      <Kpi
        title="Espera média"
        value={
          summary.averageWaitMinutes == null ? '—' : `${Math.round(summary.averageWaitMinutes)} min`
        }
        note={wait.text}
        noteTone={wait.tone}
      />
      <Kpi
        title="Leituras incertas"
        value={uncertainPercent == null ? '—' : `${uncertainPercent}%`}
        note={
          uncertainPercent != null && uncertainPercent > UNCERTAIN_TARGET_PERCENT
            ? `acima da meta (${UNCERTAIN_TARGET_PERCENT}%)`
            : `meta: até ${UNCERTAIN_TARGET_PERCENT}%`
        }
        noteTone={
          uncertainPercent != null && uncertainPercent > UNCERTAIN_TARGET_PERCENT
            ? 'warning'
            : 'muted'
        }
      />
      <Kpi
        title="Entradas recusadas"
        value={String(summary.cancelled)}
        note={`${summary.cancelledWithoutSchedule} sem agendamento`}
      />
    </div>
  )
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchRecentCheckins({ limit: SAMPLE_SIZE }), fetchLogs({ limit: SAMPLE_SIZE })])
      .then(([checkinsResponse, logs]) => {
        const checkins = Array.isArray(checkinsResponse)
          ? checkinsResponse
          : (checkinsResponse?.items ?? [])
        const now = new Date()
        setData({
          summary: summarizeCheckins(checkins, now),
          uncertainPercent: uncertainReadingsPercent(logs, now),
        })
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar os relatórios.'),
      )
  }, [])

  return (
    <section className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p className="subtitle">Visão consolidada da operação de hoje, sem ações de check-in.</p>
        </div>
        <span className="readonly-badge">
          <Eye aria-hidden="true" size={18} />
          Somente leitura
        </span>
      </div>

      {!data && !error && <p className="message">Carregando…</p>}
      {error && <p className="message error">{error}</p>}

      {data?.summary.total === 0 && <p className="message">Nenhum check-in registrado hoje.</p>}

      {data && data.summary.total > 0 && (
        <>
          <ReportKpis data={data} />
          <div className="reports-layout">
            <HourlyChart summary={data.summary} />
            <DecisionTable summary={data.summary} />
          </div>
        </>
      )}
    </section>
  )
}
