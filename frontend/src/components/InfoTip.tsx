import { Info } from 'lucide-react'
import { useId } from 'react'

interface InfoTipProps {
  label: string
  text: string
}

export default function InfoTip({ label, text }: InfoTipProps) {
  const tooltipId = useId()

  return (
    <span className="info-tip">
      <button
        type="button"
        className="icon-button info-tip-button"
        aria-label={`O que faz: ${label}`}
        aria-describedby={tooltipId}
      >
        <Info aria-hidden="true" size={16} />
      </button>
      <span role="tooltip" id={tooltipId} className="info-tip-text">
        {text}
      </span>
    </span>
  )
}
