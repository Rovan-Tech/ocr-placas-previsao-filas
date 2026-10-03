import { useEffect } from 'react'
import type { ScheduleOut } from '../../../src/services/api'
import { registeredSchedule, scheduleFormCreated } from './scheduleFormState'

interface ScheduleFormMockProps {
  onCreated: (schedule: ScheduleOut) => void
  initialPlate?: string
}

export default function ScheduleFormMock({ onCreated, initialPlate }: ScheduleFormMockProps) {
  useEffect(() => {
    scheduleFormCreated.current = onCreated
  }, [onCreated])

  return (
    <div>
      <p data-testid="initial-plate">{initialPlate ?? ''}</p>
      <button type="button" onClick={() => onCreated(registeredSchedule)}>
        Simular cadastro
      </button>
    </div>
  )
}
