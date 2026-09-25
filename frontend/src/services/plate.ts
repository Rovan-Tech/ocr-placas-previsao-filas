import type { CargoCategory, CheckInStatus, DriverDocumentType, PlateFormat, ScheduleStatus, VerificationStatus } from './api'

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

const CARGO_CATEGORY_LABELS: Record<CargoCategory, string> = {
  perecivel: 'Perecível',
  nao_perecivel: 'Não perecível',
  quimico: 'Químico',
  toxico: 'Tóxico',
  inflamavel: 'Inflamável',
}

export function cargoCategoryLabel(category: CargoCategory): string {
  return CARGO_CATEGORY_LABELS[category]
}

const DRIVER_DOCUMENT_TYPE_LABELS: Record<DriverDocumentType, string> = {
  cpf: 'CPF',
  rg: 'RG',
  cnh: 'CNH',
}

export function driverDocumentTypeLabel(type: DriverDocumentType): string {
  return DRIVER_DOCUMENT_TYPE_LABELS[type]
}

export const CPF_LENGTH = 11
export const CNH_LENGTH = 11
export const RG_MIN_LENGTH = 7
export const RG_MAX_LENGTH = 9

export function sanitizeDriverDocument(value: string, type: DriverDocumentType): string {
  if (type === 'cpf' || type === 'cnh') return value.replace(/\D/g, '').slice(0, CPF_LENGTH)
  if (type === 'rg') return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CPF_LENGTH)
  return value
}

function cpfCheckDigit(digits: string): string {
  const weight = digits.length + 1
  const total = digits
    .split('')
    .reduce((sum, digit, index) => sum + Number(digit) * (weight - index), 0)
  const remainder = total % 11
  return remainder < 2 ? '0' : String(11 - remainder)
}

export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== CPF_LENGTH || digits === digits.charAt(0).repeat(CPF_LENGTH)) return false
  const firstDigit = cpfCheckDigit(digits.slice(0, 9))
  const secondDigit = cpfCheckDigit(digits.slice(0, 9) + firstDigit)
  return digits.slice(9) === firstDigit + secondDigit
}

export function isValidCnh(cnh: string): boolean {
  return cnh.replace(/\D/g, '').length === CNH_LENGTH
}

export function isValidRg(rg: string): boolean {
  const cleaned = rg.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length === CPF_LENGTH) return isValidCpf(cleaned)
  return cleaned.length >= RG_MIN_LENGTH && cleaned.length <= RG_MAX_LENGTH
}

export function isDriverDocumentTooShortToJudge(type: DriverDocumentType, value: string): boolean {
  if (type === 'rg') return value.replace(/[^a-zA-Z0-9]/g, '').length < RG_MIN_LENGTH
  return value.replace(/\D/g, '').length < CPF_LENGTH
}

export function isValidDriverDocument(type: DriverDocumentType, value: string): boolean {
  if (type === 'cpf') return isValidCpf(value)
  if (type === 'cnh') return isValidCnh(value)
  return isValidRg(value)
}

const DRIVER_DOCUMENT_HINTS: Record<DriverDocumentType, string> = {
  cpf: '11 dígitos — o dígito verificador é conferido automaticamente.',
  cnh: '11 dígitos (9 do número de registro + 2 dígitos verificadores).',
  rg: 'De 7 a 9 caracteres (padrão estadual, pode ter letra) ou, se for a nova Carteira de ' +
    'Identidade Nacional, os 11 dígitos do CPF.',
}

export function driverDocumentHint(type: DriverDocumentType): string {
  return DRIVER_DOCUMENT_HINTS[type]
}

export const CHASSIS_LENGTH = 17

export function sanitizeChassis(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, CHASSIS_LENGTH)
}

const CHECKIN_STATUS_LABELS: Record<CheckInStatus, string> = {
  waiting: 'Aguardando decisão',
  admitted: 'Entrada autorizada',
  cancelled: 'Entrada recusada',
}

export function checkInStatusLabel(status: CheckInStatus): string {
  return CHECKIN_STATUS_LABELS[status]
}

export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
