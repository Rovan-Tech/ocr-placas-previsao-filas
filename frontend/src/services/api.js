// Todas as chamadas passam por /api, que o Vite repassa para o FastAPI
// (ver vite.config.js). Em produção, basta servir o backend no mesmo /api.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new ApiError('Não foi possível conectar ao backend.', 0)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : null
    throw new ApiError(detail || `Erro ${response.status} ao chamar o backend.`, response.status)
  }
  return body
}

/** Envia a foto da placa para o OCR. Retorna { filename, detections: [{ text, confidence }] }. */
export function uploadPlateImage(file) {
  const form = new FormData()
  form.append('file', file)
  return request('/ocr/upload', { method: 'POST', body: form })
}

/** Lista os check-ins recentes. O endpoint GET /checkins ainda será criado no backend. */
export function fetchRecentCheckins({ limit = 20 } = {}) {
  return request(`/checkins?limit=${limit}`)
}
