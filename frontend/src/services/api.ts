import { getAuthToken, notifyPasswordChangeRequired, notifySessionInvalid } from './authToken'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface OcrDetection {
  text: string
  confidence: number
}

export type PlateFormat = 'mercosul' | 'antigo'

export type VerificationStatus = 'not_checked' | 'regular' | 'irregular' | 'not_found' | 'unavailable'

export interface PlateVerification {
  status: VerificationStatus
  detail: string
  source: string | null
}

export interface OcrUploadResponse {
  filename: string | null
  plate: string | null
  plate_format: PlateFormat | null
  confidence: number | null
  needs_review: boolean
  verification: PlateVerification | null
  detections: OcrDetection[]
  audit_saved?: boolean | null
}

export interface Checkin {
  id: number
  plate: string
  created_at: string | null
  estimated_wait_minutes: number | null
}

export class ApiError extends Error {
  readonly status: number
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
    if (response.status === 401) notifySessionInvalid()
    if (code === 'password_change_required') notifyPasswordChangeRequired()
    throw new ApiError(message || `Erro ${response.status} ao chamar o backend.`, response.status, code)
  }
  return body as T
}

export function uploadPlateImage(file: File): Promise<OcrUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<OcrUploadResponse>('/ocr/upload', { method: 'POST', body: form })
}

export interface ManualPlateContext {
  photo?: File | null
  ocrPlate?: string | null
  ocrConfidence?: number | null
}

export function submitPlateManually(plate: string, context: ManualPlateContext = {}): Promise<OcrUploadResponse> {
  const form = new FormData()
  form.append('plate', plate)
  if (context.photo) form.append('photo', context.photo)
  if (context.ocrPlate) form.append('ocr_plate', context.ocrPlate)
  if (context.ocrConfidence != null) form.append('ocr_confidence', String(context.ocrConfidence))
  return request<OcrUploadResponse>('/ocr/manual', { method: 'POST', body: form })
}

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

export function fetchLogs({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<
  UploadLogEntry[]
> {
  return request(`/logs?limit=${limit}&offset=${offset}`)
}

export async function fetchLogPhoto(logId: number): Promise<Blob> {
  const headers = new Headers()
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}/logs/${logId}/photo`, { headers })
  if (!response.ok) throw new ApiError('Não foi possível carregar a foto.', response.status)
  return response.blob()
}
