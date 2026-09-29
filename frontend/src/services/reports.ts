import type { Checkin, UploadLogEntry } from './api'

export const WAIT_TARGET_MINUTES = 10
export const UNCERTAIN_TARGET_PERCENT = 5

export interface HourBucket {
  hour: number
  count: number
}

export interface ReportSummary {
  total: number
  averageWaitMinutes: number | null
  admitted: number
  waiting: number
  cancelled: number
  cancelledWithoutSchedule: number
  changeVsYesterdayPercent: number | null
  byHour: HourBucket[]
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function hourBuckets(dates: Date[]): HourBucket[] {
  if (dates.length === 0) return []
  const counts = new Map<number, number>()
  for (const date of dates) counts.set(date.getHours(), (counts.get(date.getHours()) ?? 0) + 1)
  const hours = [...counts.keys()]
  const first = Math.min(...hours)
  const last = Math.max(...hours)
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    hour: first + index,
    count: counts.get(first + index) ?? 0,
  }))
}

export function summarizeCheckins(checkins: Checkin[], now: Date): ReportSummary {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const datedCheckins = checkins.filter(
    (checkin): checkin is Checkin & { created_at: string } => checkin.created_at != null,
  )
  const today = datedCheckins.filter((checkin) => isSameLocalDay(new Date(checkin.created_at), now))
  const yesterdayCount = datedCheckins.filter((checkin) =>
    isSameLocalDay(new Date(checkin.created_at), yesterday),
  ).length

  const waits = today
    .map((checkin) => checkin.estimated_wait_minutes)
    .filter((minutes): minutes is number => minutes != null)
  const cancelled = today.filter((checkin) => checkin.status === 'cancelled')

  return {
    total: today.length,
    averageWaitMinutes:
      waits.length > 0 ? waits.reduce((sum, minutes) => sum + minutes, 0) / waits.length : null,
    admitted: today.filter((checkin) => checkin.status === 'admitted').length,
    waiting: today.filter((checkin) => checkin.status === 'waiting').length,
    cancelled: cancelled.length,
    cancelledWithoutSchedule: cancelled.filter((checkin) => checkin.schedule_id == null).length,
    changeVsYesterdayPercent:
      yesterdayCount > 0
        ? Math.round(((today.length - yesterdayCount) / yesterdayCount) * 100)
        : null,
    byHour: hourBuckets(today.map((checkin) => new Date(checkin.created_at))),
  }
}

export function uncertainReadingsPercent(logs: UploadLogEntry[], now: Date): number | null {
  const todayLogs = logs.filter((log) => isSameLocalDay(new Date(log.created_at), now))
  if (todayLogs.length === 0) return null
  const uncertain = todayLogs.filter((log) => log.needs_review).length
  return Math.round((uncertain / todayLogs.length) * 100)
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}h`
}
