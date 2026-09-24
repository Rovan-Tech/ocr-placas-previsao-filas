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

export type ScheduleStatus = 'on_time' | 'early' | 'late'

export interface ScheduleInfo {
  driver_name: string
  driver_document: string
  has_driver_document_photo_front: boolean
  has_driver_document_photo_back: boolean
  has_vehicle_document_photo: boolean
  cargo_type: string
  scheduled_date: string
  status: ScheduleStatus
}

export interface VehicleData {
  brand: string | null
  model: string | null
  year: string | null
  uf: string | null
  color: string | null
  is_mock: boolean
}

export interface CheckinContext {
  found: boolean
  schedule: ScheduleInfo | null
  vehicle_data: VehicleData | null
}

export interface OcrUploadResponse {
  filename: string | null
  plate: string | null
  plate_format: PlateFormat | null
  confidence: number | null
  needs_review: boolean
  verification: PlateVerification | null
  detections: OcrDetection[]
  checkin: CheckinContext | null
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

export interface ScheduleOut {
  id: number
  plate: string
  driver_name: string
  driver_document: string
  has_driver_document_photo_front: boolean
  has_driver_document_photo_back: boolean
  has_vehicle_document_photo: boolean
  cargo_type: string
  scheduled_date: string
  created_at: string
}

export interface CreateScheduleInput {
  plate: string
  driverName: string
  driverDocument: string
  cargoType: string
  scheduledDate: string
  driverDocumentPhotoFront?: File | null
  driverDocumentPhotoBack?: File | null
  vehicleDocumentPhoto?: File | null
}

export function createSchedule(input: CreateScheduleInput): Promise<ScheduleOut> {
  const form = new FormData()
  form.append('plate', input.plate)
  form.append('driver_name', input.driverName)
  form.append('driver_document', input.driverDocument)
  form.append('cargo_type', input.cargoType)
  form.append('scheduled_date', input.scheduledDate)
  if (input.driverDocumentPhotoFront) form.append('driver_document_photo_front', input.driverDocumentPhotoFront)
  if (input.driverDocumentPhotoBack) form.append('driver_document_photo_back', input.driverDocumentPhotoBack)
  if (input.vehicleDocumentPhoto) form.append('vehicle_document_photo', input.vehicleDocumentPhoto)
  return request<ScheduleOut>('/schedules', { method: 'POST', body: form })
}

export function listSchedules(plate?: string): Promise<ScheduleOut[]> {
  return request(`/schedules${plate ? `?plate=${encodeURIComponent(plate)}` : ''}`)
}

async function fetchSchedulePhoto(
  scheduleId: number,
  kind: 'driver-document-photo-front' | 'driver-document-photo-back' | 'vehicle-document-photo',
): Promise<Blob> {
  const headers = new Headers()
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}/schedules/${scheduleId}/${kind}`, { headers })
  if (!response.ok) throw new ApiError('Não foi possível carregar a foto.', response.status)
  return response.blob()
}

export function fetchScheduleDriverDocumentPhotoFront(scheduleId: number): Promise<Blob> {
  return fetchSchedulePhoto(scheduleId, 'driver-document-photo-front')
}

export function fetchScheduleDriverDocumentPhotoBack(scheduleId: number): Promise<Blob> {
  return fetchSchedulePhoto(scheduleId, 'driver-document-photo-back')
}

export function fetchScheduleVehicleDocumentPhoto(scheduleId: number): Promise<Blob> {
  return fetchSchedulePhoto(scheduleId, 'vehicle-document-photo')
}
