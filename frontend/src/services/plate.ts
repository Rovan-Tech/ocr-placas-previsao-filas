import type { PlateFormat, ScheduleStatus, VerificationStatus } from './api'

export function formatPlate(plate: string, format: PlateFormat | null): string {
  return format === 'antigo' ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate
}

export function plateFormatLabel(format: PlateFormat | null): string {
  if (format === 'mercosul') return 'Mercosul'
  if (format === 'antigo') return 'Padrão antigo'
  return 'Formato desconhecido'
}

export type Tone = 'ok' | 'warning' | 'danger' | 'neutral'

export interface VerificationInfo {
  label: string
  tone: Tone
  blocksEntry: boolean
}

const VERIFICATION_INFO: Record<VerificationStatus, VerificationInfo> = {
  not_checked: { label: 'Não verificada na base oficial', tone: 'neutral', blocksEntry: false },
  regular: { label: 'Placa regular', tone: 'ok', blocksEntry: false },
  irregular: { label: 'Placa com restrição', tone: 'danger', blocksEntry: true },
  not_found: { label: 'Placa não encontrada — possível placa falsa', tone: 'danger', blocksEntry: true },
  unavailable: { label: 'Base oficial indisponível', tone: 'warning', blocksEntry: false },
}

export function verificationInfo(status: VerificationStatus): VerificationInfo {
  return VERIFICATION_INFO[status]
}

export function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(1)}%`
}

export interface ScheduleStatusInfo {
  label: string
  tone: Tone
}

const SCHEDULE_STATUS_INFO: Record<ScheduleStatus, ScheduleStatusInfo> = {
  on_time: { label: 'Agendado para hoje', tone: 'ok' },
  early: { label: 'Adiantado', tone: 'warning' },
  late: { label: 'Atrasado', tone: 'danger' },
}

export function scheduleStatusInfo(status: ScheduleStatus): ScheduleStatusInfo {
  return SCHEDULE_STATUS_INFO[status]
}

export function formatScheduledDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
