import type { ReactNode } from 'react'
import {
  resolveStatusMessageClassName,
  resolveStatusMessageRole,
  type StatusMessageTone,
} from '../services/statusMessage'

interface StatusMessageProps {
  tone: StatusMessageTone
  children: ReactNode
  className?: string
}

export default function StatusMessage({ tone, children, className }: StatusMessageProps) {
  const classes = className ? `${resolveStatusMessageClassName(tone)} ${className}` : resolveStatusMessageClassName(tone)
  return (
    <p className={classes} role={resolveStatusMessageRole(tone)}>
      {children}
    </p>
  )
}
