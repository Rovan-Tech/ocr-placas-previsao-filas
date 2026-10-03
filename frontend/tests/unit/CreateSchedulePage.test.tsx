import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateSchedulePage from '../../src/pages/CreateSchedulePage'
import { listSchedules, type ScheduleOut } from '../../src/services/api'
import type { PermissionKey } from '../../src/services/roles'
import { setAuth } from './support/authMock'
import { makeEmployee } from './support/fixtures'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/components/ScheduleForm', async () => ({
  default: (await import('./support/scheduleFormMock')).default,
}))
vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  listSchedules: vi.fn(),
}))

const listSchedulesMock = vi.mocked(listSchedules)

function makeSchedule(overrides: Partial<ScheduleOut> = {}): ScheduleOut {
  return {
    id: 1,
    plate: 'ABC1D23',
    driver_name: 'Carlos Lima',
    driver_birth_date: '1980-01-01',
    driver_birth_place: 'São Luís',
    driver_birth_state: 'MA',
    driver_document_type: 'cpf',
    driver_document: '12345678909',
    driver_document_validated: true,
    driver_document_validation_detail: 'ok',
    vehicle_brand: 'Volvo',
    vehicle_model: 'FH',
    vehicle_year: '2020',
    vehicle_chassis: '9BWZZZ377VT004251',
    vehicle_color: 'Branco',
    vehicle_length_m: 12,
    vehicle_height_m: 4,
    vehicle_width_m: 2.5,
    origin_location: 'Imperatriz',
    destination_location: 'Porto',
    cargo_items: [{ id: 1, product_name: 'Soja', category: 'nao_perecivel' }],
    scheduled_date: '2026-03-10',
    created_at: '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

function withPermissions(permissions: PermissionKey[]) {
  setAuth({ employee: makeEmployee({ permissions }) })
}

beforeEach(() => {
  setAuth()
  listSchedulesMock.mockReset().mockResolvedValue([makeSchedule()])
})

describe('CreateSchedulePage', () => {
  it('lista os agendamentos com carga, trajeto, data e situação do documento', async () => {
    listSchedulesMock.mockResolvedValue([
      makeSchedule(),
      makeSchedule({ id: 2, plate: 'XYZ9K88', driver_document_validated: false }),
    ])
    render(<CreateSchedulePage />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(await screen.findAllByText('Carlos Lima')).toHaveLength(2)
    expect(screen.getAllByText('Soja (Não perecível)')).toHaveLength(2)
    expect(screen.getAllByText('Imperatriz → Porto')).toHaveLength(2)
    expect(screen.getAllByText('10/03/2026')).toHaveLength(2)
    expect(screen.getByText('Confere com a foto')).toBeInTheDocument()
    expect(screen.getByText('Confira manualmente')).toBeInTheDocument()
  })

  it('mostra o estado vazio', async () => {
    listSchedulesMock.mockResolvedValue([])
    render(<CreateSchedulePage />)

    expect(await screen.findByText('Nenhum agendamento cadastrado ainda.')).toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Sem acesso.'), 'Sem acesso.'],
    ['um valor desconhecido', 'x', 'Erro ao carregar agendamentos.'],
  ])('mostra o erro de carregamento com %s', async (_nome, failure, message) => {
    listSchedulesMock.mockRejectedValue(failure)
    render(<CreateSchedulePage />)

    expect(await screen.findByText(message)).toHaveClass('error')
  })

  it('o formulário de cadastro adiciona o novo agendamento no topo da lista', async () => {
    const user = userEvent.setup()
    render(<CreateSchedulePage />)
    await screen.findByText('Carlos Lima')

    await user.click(screen.getByRole('button', { name: 'Simular cadastro' }))

    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('NEW1A11')
    expect(rows[2]).toHaveTextContent('ABC1D23')
  })

  it('quem só visualiza não vê o formulário', async () => {
    withPermissions(['schedules.view'])
    render(<CreateSchedulePage />)

    expect(await screen.findByText('Carlos Lima')).toBeInTheDocument()
    expect(screen.queryByText('Cadastrar agendamento')).not.toBeInTheDocument()
  })

  it('quem só cria não vê nem busca a lista', () => {
    withPermissions(['schedules.create'])
    render(<CreateSchedulePage />)

    expect(listSchedulesMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Cadastrar agendamento')).toBeInTheDocument()
  })
})
