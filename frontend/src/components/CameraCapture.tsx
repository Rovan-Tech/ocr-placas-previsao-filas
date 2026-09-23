import { useEffect, useRef, useState, type ChangeEvent } from 'react'

// getUserMedia só funciona em contexto seguro (HTTPS ou localhost). Quando não
// está disponível — ex.: celular acessando o dev server pelo IP da rede —, o
// input com capture="environment" abre a câmera nativa do aparelho.
const canUseLiveCamera = Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext

// Fotos de câmera de celular saem facilmente com 8-15 MB em resolução total —
// muito mais do que o OCR precisa para ler uma placa, e acima do limite de
// upload do backend (5 MB, ver MAX_UPLOAD_BYTES em backend/app/routers/ocr.py).
// Redimensiona no navegador antes de enviar, tanto a foto tirada pela câmera
// ao vivo quanto a escolhida via input (câmera nativa do aparelho ou galeria).
const MAX_DIMENSION_PX = 1600
const JPEG_QUALITY = 0.85

function drawScaledCanvas(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D não suportado neste navegador.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToJpegFile(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], filename, { type: 'image/jpeg' })) : reject(new Error('toBlob falhou'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem enviada.'))
    }
    image.src = url
  })
}

/** Redimensiona uma foto escolhida pelo usuário (input file) antes de enviar. */
async function resizeImageFile(file: File): Promise<File> {
  const image = await loadImage(file)
  const canvas = drawScaledCanvas(image, image.naturalWidth, image.naturalHeight)
  return canvasToJpegFile(canvas, file.name.replace(/\.\w+$/, '') + '.jpg')
}

interface CameraCaptureProps {
  onCapture: (file: File) => void
  disabled?: boolean
}

export default function CameraCapture({ onCapture, disabled = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraOn, setCameraOn] = useState(false)
  // Só dá para capturar depois que o vídeo tem frames (videoWidth > 0).
  const [videoReady, setVideoReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
    setVideoReady(false)
  }

  useEffect(() => stopCamera, [])

  async function startCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch (error) {
      setCameraError(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere o acesso ou envie uma foto.'
          : 'Não foi possível abrir a câmera. Envie uma foto do aparelho.',
      )
    }
  }

  async function takePhoto() {
    const video = videoRef.current
    if (!video) return
    try {
      const canvas = drawScaledCanvas(video, video.videoWidth, video.videoHeight)
      const file = await canvasToJpegFile(canvas, `placa-${Date.now()}.jpg`)
      stopCamera()
      onCapture(file)
    } catch {
      setCameraError('Não foi possível gerar a foto. Tente novamente.')
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      onCapture(await resizeImageFile(file))
    } catch {
      setCameraError('Não foi possível processar a foto enviada. Tente outra.')
    }
  }

  return (
    <div className="camera">
      <div className={`camera-viewport ${cameraOn ? 'is-on' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted onLoadedData={() => setVideoReady(true)} />
        {!cameraOn && <p className="camera-placeholder">Aponte a câmera para a placa do caminhão</p>}
        {cameraOn && <div className="camera-guide" aria-hidden="true" />}
      </div>

      {cameraError && <p className="message error">{cameraError}</p>}

      <div className="camera-actions">
        {canUseLiveCamera && !cameraOn && (
          <button type="button" className="primary" onClick={startCamera} disabled={disabled}>
            Abrir câmera
          </button>
        )}
        {cameraOn && (
          <>
            <button type="button" className="primary" onClick={takePhoto} disabled={disabled || !videoReady}>
              Tirar foto
            </button>
            <button type="button" onClick={stopCamera}>Cancelar</button>
          </>
        )}
        {!cameraOn && (
          <button
            type="button"
            className={canUseLiveCamera ? '' : 'primary'}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            {canUseLiveCamera ? 'Enviar foto do aparelho' : 'Fotografar placa'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFile}
          hidden
        />
      </div>
    </div>
  )
}
