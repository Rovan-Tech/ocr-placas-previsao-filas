// Em dev, todas as chamadas passam por /api, que o Vite repassa para o
// FastAPI (ver vite.config.ts). Em produção (frontend e backend em domínios
// diferentes), o build recebe VITE_API_BASE com a URL completa do backend —
// ver o passo de build em .github/workflows/deploy.yml.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface OcrDetection {
  text: string
  confidence: number
}

export interface OcrUploadResponse {
  filename: string
  detections: OcrDetection[]
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

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new ApiError('Não foi possível conectar ao backend.', 0)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : null
    throw new ApiError(detail || `Erro ${response.status} ao chamar o backend.`, response.status)
  }
  return body as T
}

/** Envia a foto da placa para o OCR. */
export function uploadPlateImage(file: File): Promise<OcrUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<OcrUploadResponse>('/ocr/upload', { method: 'POST', body: form })
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
