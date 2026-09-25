import type { Checkin } from './api'

export interface TrendPoint {
  plate: string
  minutes: number
  timestamp: number
}

const MIN_Y_CEILING = 10

export function toTrendPoints(checkins: Checkin[]): TrendPoint[] {
  return checkins
    .filter((checkin): checkin is Checkin & { created_at: string; estimated_wait_minutes: number } =>
      checkin.created_at != null && checkin.estimated_wait_minutes != null,
    )
    .map((checkin) => ({
      plate: checkin.plate,
      minutes: checkin.estimated_wait_minutes,
      timestamp: new Date(checkin.created_at).getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function niceMax(value: number): number {
  const withHeadroom = Math.max(value * 1.15, MIN_Y_CEILING)
  const magnitude = 10 ** Math.floor(Math.log10(withHeadroom))
  return Math.ceil(withHeadroom / magnitude) * magnitude
}
