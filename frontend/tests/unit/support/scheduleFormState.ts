import type { ScheduleOut } from '../../../src/services/api'

export const registeredSchedule = {
  id: 99,
  plate: 'NEW1A11',
  driver_name: 'Motorista Novo',
  driver_document: '11144477735',
  driver_document_validated: true,
  driver_document_validation_detail: 'Documento confere.',
  cargo_items: [{ id: 1, product_name: 'Milho', category: 'perecivel' }],
  scheduled_date: '2026-03-11',
  origin_location: 'A',
  destination_location: 'B',
} as ScheduleOut

export const scheduleFormCreated: { current: ((schedule: ScheduleOut) => void) | null } = {
  current: null,
}
