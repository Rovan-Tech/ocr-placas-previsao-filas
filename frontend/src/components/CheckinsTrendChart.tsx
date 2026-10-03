import { useState } from 'react'
import type { Checkin } from '../services/api'
import { niceMax, toTrendPoints, type TrendPoint } from '../services/checkinsTrend'

const VIEW_WIDTH = 640
const VIEW_HEIGHT = 220
const PADDING = { top: 24, right: 24, bottom: 28, left: 24 }
const Y_TICKS = 2
const POINT_RADIUS = 5
const HOVER_POINT_RADIUS = 7
const MAX_X_LABELS = 6

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

const NO_DATA_MESSAGE = 'Ainda não há dados suficientes para o gráfico de tendência.'

interface TrendCoordinate extends TrendPoint {
  x: number
  y: number
}

export default function CheckinsTrendChart({ checkins }: Readonly<{ checkins: Checkin[] }>) {
  const [hovered, setHovered] = useState<TrendCoordinate | null>(null)

  const [firstPoint, ...restPoints] = toTrendPoints(checkins)

  if (!firstPoint) {
    return <p className="message">{NO_DATA_MESSAGE}</p>
  }

  const points = [firstPoint, ...restPoints]
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

  function toCoordinate(point: TrendPoint): TrendCoordinate {
    return { ...point, x: xForTimestamp(point.timestamp), y: yForMinutes(point.minutes) }
  }

  const firstCoordinate = toCoordinate(firstPoint)
  const restCoordinates = restPoints.map(toCoordinate)
  const coordinates = [firstCoordinate, ...restCoordinates]

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const areaPath =
    coordinates.length > 1
      ? `${linePath} L ${xForTimestamp(maxTimestamp)} ${PADDING.top + plotHeight} ` +
        `L ${xForTimestamp(minTimestamp)} ${PADDING.top + plotHeight} Z`
      : ''

  const peak = restCoordinates.reduce(
    (highest, point) => (point.minutes > highest.minutes ? point : highest),
    firstCoordinate,
  )
  const markedPoints = hovered && hovered.timestamp !== peak.timestamp ? [peak, hovered] : [peak]

  const yTickValues = Array.from({ length: Y_TICKS + 1 }, (_, index) => (yMax / Y_TICKS) * index)

  const xLabelStep = Math.max(1, Math.ceil(coordinates.length / MAX_X_LABELS))
  const xLabelPoints = coordinates.filter(
    (_, index) => index % xLabelStep === 0 || index === coordinates.length - 1,
  )

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH
    const nearest = restCoordinates.reduce(
      (closest, point) =>
        Math.abs(point.x - relativeX) < Math.abs(closest.x - relativeX) ? point : closest,
      firstCoordinate,
    )
    setHovered(nearest)
  }

  return (
    <div className="checkins-trend">
      <svg
        className="checkins-trend-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`Tendência do tempo de espera estimado ao longo do dia, de ${timeFormatter.format(minTimestamp)} a ${timeFormatter.format(maxTimestamp)}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="checkins-trend-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="checkins-trend-gradient-start" />
            <stop offset="100%" className="checkins-trend-gradient-end" />
          </linearGradient>
        </defs>

        {yTickValues.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={yForMinutes(value)}
              y2={yForMinutes(value)}
              className="checkins-trend-grid"
            />
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

        {areaPath && (
          <path d={areaPath} className="checkins-trend-area" fill="url(#checkins-trend-gradient)" />
        )}
        <path d={linePath} className="checkins-trend-line" />

        {markedPoints.map((point) => (
          <circle
            key={point.timestamp}
            cx={point.x}
            cy={point.y}
            r={point.timestamp === hovered?.timestamp ? HOVER_POINT_RADIUS : POINT_RADIUS}
            className="checkins-trend-point"
          />
        ))}

        {!hovered && (
          <text
            x={peak.x}
            y={peak.y - 12}
            className="checkins-trend-peak-label"
            textAnchor="middle"
          >
            {Math.round(peak.minutes)} min
          </text>
        )}

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
          style={{
            left: `${(hovered.x / VIEW_WIDTH) * 100}%`,
            top: `${(hovered.y / VIEW_HEIGHT) * 100}%`,
          }}
        >
          <strong className="plate">{hovered.plate}</strong>
          <span>{timeFormatter.format(hovered.timestamp)}</span>
          <span>{Math.round(hovered.minutes)} min</span>
        </div>
      )}
    </div>
  )
}
