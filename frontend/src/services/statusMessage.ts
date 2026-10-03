export type StatusMessageTone = 'error' | 'warning' | 'review' | 'success' | 'info'

const ALERT_TONES: ReadonlySet<StatusMessageTone> = new Set(['error', 'warning', 'review'])

export function resolveStatusMessageRole(tone: StatusMessageTone): 'alert' | 'status' {
  return ALERT_TONES.has(tone) ? 'alert' : 'status'
}

export function resolveStatusMessageClassName(tone: StatusMessageTone): string {
  if (tone === 'error') return 'message error'
  if (tone === 'warning') return 'message warning'
  if (tone === 'review') return 'message review'
  return 'message'
}
