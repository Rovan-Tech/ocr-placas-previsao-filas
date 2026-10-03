interface CameraMockProps {
  onCapture: (file: File) => void
  disabled?: boolean
}

export default function CameraCaptureMock({ onCapture, disabled = false }: CameraMockProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCapture(new File(['jpeg'], 'placa.jpg', { type: 'image/jpeg' }))}
    >
      Simular captura
    </button>
  )
}
