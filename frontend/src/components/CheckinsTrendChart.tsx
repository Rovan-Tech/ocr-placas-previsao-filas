import { useRef, useState } from 'react'
import type { Checkin } from '../services/api'
import { niceMax, toTrendPoints, type TrendPoint } from '../services/checkinsTrend'

const VIEW_WIDTH = 640
const VIEW_HEIGHT = 220
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 }
const Y_TICKS = 4
const MAX_X_LABELS = 6

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface TrendCoordinate extends TrendPoint {
  x: number
  y: number
}

export default function CheckinsTrendChart({ checkins }: { checkins: Checkin[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<TrendCoordinate | null>(null)

  const points = toTrendPoints(checkins)

  if (points.length === 0) {
    return <p className="message">Ainda não há dados suficientes para o gráfico de tendência.</p>
  }

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom
  const minTimestamp = Math.min(...points.map((point) => point.timestamp))
  const maxTimestamp = Math.max(...points.map((point) => point.timestamp))
  const timestampRange = maxTimestamp - minTimestamp || 1
  const yMax = niceMax(Math.max(...points.map((point) => point.minutes)))

  function xForTimestamp(timestamp: number): number {
    return PADDING.left + ((timestamp - minTimestamp) / timestampRange) * plotWidth
  }

  function yForMinutes(minutes: number): number {
    return PADDING.top + plotHeight - (minutes / yMax) * plotHeight
  }

  const coordinates = points.map((point) => ({
    ...point,
    x: xForTimestamp(point.timestamp),
    y: yForMinutes(point.minutes),
  }))

  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath =
    coordinates.length > 1
      ? `${linePath} L ${xForTimestamp(maxTimestamp)} ${PADDING.top + plotHeight} ` +
        `L ${xForTimestamp(minTimestamp)} ${PADDING.top + plotHeight} Z`
      : ''

  const yTickValues = Array.from({ length: Y_TICKS + 1 }, (_, index) => (yMax / Y_TICKS) * index)

  const xLabelStep = Math.max(1, Math.ceil(coordinates.length / MAX_X_LABELS))
  const xLabelPoints = coordinates.filter(
    (_, index) => index % xLabelStep === 0 || index === coordinates.length - 1,
  )

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || coordinates.length === 0) return
    const rect = svg.getBoundingClientRect()
    const relativeX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH
    const nearest = coordinates.reduce((closest, point) =>
      Math.abs(point.x - relativeX) < Math.abs(closest.x - relativeX) ? point : closest,
    )
    setHovered(nearest)
  }

  return (
    <div className="checkins-trend">
      <svg
        ref={svgRef}
        className="checkins-trend-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`Tendência do tempo de espera estimado ao longo do dia, de ${timeFormatter.format(minTimestamp)} a ${timeFormatter.format(maxTimestamp)}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        {yTickValues.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={yForMinutes(value)}
              y2={yForMinutes(value)}
              className="checkins-trend-grid"
            />
            <text x={PADDING.left - 8} y={yForMinutes(value)} className="checkins-trend-axis-label" textAnchor="end" dy="0.32em">
              {Math.round(value)}
            </text>
          </g>
        ))}

        {xLabelPoints.map((point) => (
          <text
            key={point.timestamp}
            x={point.x}
            y={VIEW_HEIGHT - PADDING.bottom + 18}
            className="checkins-trend-axis-label"
            textAnchor="middle"
          >
            {timeFormatter.format(point.timestamp)}
          </text>
        ))}

        {areaPath && <path d={areaPath} className="checkins-trend-area" />}
        <path d={linePath} className="checkins-trend-line" />

        {coordinates.map((point) => (
          <circle
            key={point.timestamp}
            cx={point.x}
            cy={point.y}
            r={point.timestamp === hovered?.timestamp ? 6 : 4}
            className="checkins-trend-point"
          />
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
            className="checkins-trend-crosshair"
          />
        )}
      </svg>

      {hovered && (
        <div
          role="tooltip"
          className="checkins-trend-tooltip"
          style={{ left: `${(hovered.x / VIEW_WIDTH) * 100}%`, top: `${(hovered.y / VIEW_HEIGHT) * 100}%` }}
        >
          <strong className="plate">{hovered.plate}</strong>
          <span>{timeFormatter.format(hovered.timestamp)}</span>
          <span>{Math.round(hovered.minutes)} min</span>
        </div>
      )}
    </div>
  )
}
