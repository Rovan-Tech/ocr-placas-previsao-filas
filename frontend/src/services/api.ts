import { getAuthToken, notifyPasswordChangeRequired, notifySessionInvalid } from './authToken'

// Todas as chamadas passam por /api, que o Vite repassa para o FastAPI
// (ver vite.config.ts). Em produção, basta servir o backend no mesmo /api.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface OcrDetection {
  text: string
  confidence: number
}

export type PlateFormat = 'mercosul' | 'antigo'

/**
 * Resultado da consulta à base oficial de veículos. Hoje o backend não tem provedor
 * ligado e responde sempre `not_checked`; os demais status já são tratados na tela
 * para quando a integração existir (ver backend/app/services/plate_verification.py).
 */
export type VerificationStatus = 'not_checked' | 'regular' | 'irregular' | 'not_found' | 'unavailable'

export interface PlateVerification {
  status: VerificationStatus
  detail: string
  source: string | null
}

export interface OcrUploadResponse {
  filename: string | null
  /** Placa normalizada (7 caracteres, sem hífen) ou null se nenhuma leitura teve formato válido. */
  plate: string | null
  plate_format: PlateFormat | null
  confidence: number | null
  /** true quando o fiscal deve conferir a placa no veículo antes de liberar. */
  needs_review: boolean
  /** null quando não há placa válida (nada é consultado). */
  verification: PlateVerification | null
  /** Todos os trechos lidos pelo OCR, para conferência. */
  detections: OcrDetection[]
  /**
   * Só existe na resposta de `submitPlateManually`. null quando não havia foto para guardar de
   * resguardo; true/false conforme o registro (foto + placa digitada) foi salvo.
   */
  audit_saved?: boolean | null
}

export interface Checkin {
  id: number
  plate: string
  /** ISO 8601 */
  created_at: string | null
  estimated_wait_minutes: number | null
}

export class ApiError extends Error {
  readonly status: number
  /** Código de erro estruturado do backend (ex.: "password_change_required"), quando existe —
   * ver `detail: { code, reason, message }` em app/services/auth.py. */
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function parseErrorDetail(body: unknown): { message: string | null; code: string | undefined } {
  if (!body || typeof body !== 'object' || !('detail' in body)) return { message: null, code: undefined }
  const detail = (body as { detail: unknown }).detail
  if (typeof detail === 'string') return { message: detail, code: undefined }
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    const code = 'code' in detail && typeof detail.code === 'string' ? detail.code : undefined
    return { message: detail.message, code }
  }
  return { message: null, code: undefined }
}

// `/auth/login` e `/auth/change-password` não passam por aqui (ver services/auth.ts): tratam o
// próprio 401 (senha errada) na tela, e não devem disparar o logout/redirecionamento globais que
// os avisos abaixo disparam nas chamadas normais, autenticadas.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    throw new ApiError('Não foi possível conectar ao backend.', 0)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const { message, code } = parseErrorDetail(body)
    // Sessão inválida/expirada, ou senha temporária/vencida ainda não trocada: o AuthContext
    // trata os dois globalmente (logout ou ir pra tela de trocar senha), então a tela que fez a
    // chamada nem precisa saber disso — só recebe o ApiError se quiser mostrar algo específico.
    if (response.status === 401) notifySessionInvalid()
    if (code === 'password_change_required') notifyPasswordChangeRequired()
    throw new ApiError(message || `Erro ${response.status} ao chamar o backend.`, response.status, code)
  }
  return body as T
}

/** Envia a foto da placa para o OCR. */
export function uploadPlateImage(file: File): Promise<OcrUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<OcrUploadResponse>('/ocr/upload', { method: 'POST', body: form })
}

export interface ManualPlateContext {
  /**
   * Foto original, quando a câmera não leu a placa (ou o fiscal preferiu digitar direto em cima
   * de uma foto ruim). O backend guarda a foto junto com a placa digitada, só de resguardo — não
   * é enviada quando o fiscal digita sem nunca ter tirado foto.
   */
  photo?: File | null
  /** O que o OCR chegou a ler antes da digitação, se chegou a tentar. */
  ocrPlate?: string | null
  ocrConfidence?: number | null
}

/**
 * Envia a placa digitada pelo fiscal (câmera não leu, ou ele preferiu digitar). O backend decide
 * sozinho, pela ordem dos caracteres, se é Mercosul ou padrão antigo — aqui não se escolhe o
 * formato, só se digita o texto. Formato inválido volta como erro (`ApiError`, status 400).
 */
export function submitPlateManually(plate: string, context: ManualPlateContext = {}): Promise<OcrUploadResponse> {
  const form = new FormData()
  form.append('plate', plate)
  if (context.photo) form.append('photo', context.photo)
  if (context.ocrPlate) form.append('ocr_plate', context.ocrPlate)
  if (context.ocrConfidence != null) form.append('ocr_confidence', String(context.ocrConfidence))
  return request<OcrUploadResponse>('/ocr/manual', { method: 'POST', body: form })
}

/**
 * Lista os check-ins recentes. O backend pode devolver a lista direto ou
 * paginada em `{ items }`.
 */
export function fetchRecentCheckins({ limit = 20 }: { limit?: number } = {}): Promise<
  Checkin[] | { items?: Checkin[] }
> {
  return request(`/checkins?limit=${limit}`)
}

export interface UploadLogEntry {
  id: number
  employee_id: number
  employee_username: string
  endpoint: 'upload' | 'manual'
  client_ip: string | null
  ocr_plate: string | null
  ocr_confidence: number | null
  manual_plate: string | null
  final_plate: string | null
  final_plate_format: PlateFormat | null
  needs_review: boolean
  has_photo: boolean
  created_at: string
}

/** Quem enviou cada foto/placa, de qual endereço, e o que a leitura deu — ver GET /logs. */
export function fetchLogs({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<
  UploadLogEntry[]
> {
  return request(`/logs?limit=${limit}&offset=${offset}`)
}

/**
 * Foto de resguardo de um log. O endpoint exige `Authorization: Bearer <token>` — uma tag
 * `<img src=...>` não manda esse header sozinha, então a tela busca o arquivo por `fetch` e
 * monta um object URL a partir do Blob devolvido (ver LogsPage).
 */
export async function fetchLogPhoto(logId: number): Promise<Blob> {
  const headers = new Headers()
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}/logs/${logId}/photo`, { headers })
  if (!response.ok) throw new ApiError('Não foi possível carregar a foto.', response.status)
  return response.blob()
}
