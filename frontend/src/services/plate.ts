import type { PlateFormat, VerificationStatus } from './api'

/** Como a placa aparece fisicamente: `ABC1D23` (Mercosul) ou `ABC-1234` (padrão antigo). */
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
  /** Status que exige barrar/checar o veículo antes de liberar a entrada. */
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
