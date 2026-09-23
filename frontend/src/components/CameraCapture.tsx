import { useEffect, useRef, useState, type ChangeEvent } from 'react'

// getUserMedia só funciona em contexto seguro (HTTPS ou localhost). Quando não
// está disponível — ex.: celular acessando o dev server pelo IP da rede —, o
// input com capture="environment" abre a câmera nativa do aparelho.
const canUseLiveCamera = Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext

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

  function takePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stopCamera()
        onCapture(new File([blob], `placa-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onCapture(file)
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
