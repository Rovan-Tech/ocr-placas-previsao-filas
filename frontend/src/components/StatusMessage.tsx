import type { ReactNode } from 'react'
import {
  resolveStatusMessageClassName,
  resolveStatusMessageRole,
  type StatusMessageTone,
} from '../services/statusMessage'

interface StatusMessageProps {
  tone: StatusMessageTone
  children: ReactNode
}

export default function StatusMessage({ tone, children }: StatusMessageProps) {
  return (
    <p className={resolveStatusMessageClassName(tone)} role={resolveStatusMessageRole(tone)}>
      {children}
    </p>
  )
}
