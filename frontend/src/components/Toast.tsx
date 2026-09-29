import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

const DEFAULT_DURATION_MS = 4000

interface ToastProps {
  message: string | null
  onClose: () => void
  durationMs?: number
}

export default function Toast({ message, onClose, durationMs = DEFAULT_DURATION_MS }: ToastProps) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => onCloseRef.current(), durationMs)
    return () => clearTimeout(timer)
  }, [message, durationMs])

  if (!message) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button
        type="button"
        className="icon-button toast-close"
        aria-label="Fechar aviso"
        onClick={onClose}
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  )
}
