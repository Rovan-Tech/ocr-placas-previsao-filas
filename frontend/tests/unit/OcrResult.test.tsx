import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcrResult, { type OcrResultAccess } from '../../src/components/OcrResult'
import {
  ApiError,
  createCheckin,
  fetchScheduleDriverDocumentPhotoBack,
  fetchScheduleDriverDocumentPhotoFront,
  type CheckinContext,
  type OcrUploadResponse,
  type ScheduleInfo,
  type VehicleData,
} from '../../src/services/api'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  createCheckin: vi.fn(),
  fetchScheduleDriverDocumentPhotoFront: vi.fn(),
  fetchScheduleDriverDocumentPhotoBack: vi.fn(),
}))

const createCheckinMock = vi.mocked(createCheckin)
const frontPhotoMock = vi.mocked(fetchScheduleDriverDocumentPhotoFront)
const backPhotoMock = vi.mocked(fetchScheduleDriverDocumentPhotoBack)

const schedule: ScheduleInfo = {
  id: 10,
  driver_name: 'Carlos Lima',
  driver_document: '12345678909',
  driver_document_validated: true,
  driver_document_validation_detail: 'Documento confere com a foto.',
  cargo_items: [
    { product_name: 'Soja', category: 'nao_perecivel' },
    { product_name: 'Ácido', category: 'quimico' },
  ],
  scheduled_date: '2026-03-10',
  status: 'on_time',
}

const realVehicle: VehicleData = {
  brand: 'Volvo',
  model: 'FH 540',
  year: '2020',
  uf: 'MA',
  color: 'Branco',
  is_mock: false,
}

function makeResult(overrides: Partial<OcrUploadResponse> = {}): OcrUploadResponse {
  return {
    filename: 'placa.jpg',
    plate: 'ABC1D23',
    plate_format: 'mercosul',
    confidence: 0.934,
    needs_review: false,
    verification: null,
    detections: [],
    checkin: null,
    ...overrides,
  }
}

function makeCheckin(overrides: Partial<CheckinContext> = {}): CheckinContext {
  return {
    found: true,
    schedule,
    vehicle_data: null,
    checkin_id: 55,
    ...overrides,
  }
}

const NO_ACCESS: OcrResultAccess = {
  viewSchedules: false,
  registerArrival: false,
  authorize: false,
  refuse: false,
}

beforeEach(() => {
  createCheckinMock.mockReset()
  frontPhotoMock.mockReset()
  backPhotoMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OcrResult sem placa lida', () => {
  it('avisa e lista as leituras brutas do OCR', () => {
    render(
      <OcrResult
        result={makeResult({
          plate: null,
          plate_format: null,
          confidence: null,
          detections: [{ text: 'AB?', confidence: 0.31 }],
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma placa em formato válido foi lida.')
    expect(screen.getByText('Textos lidos pelo OCR (1)')).toBeInTheDocument()
    expect(screen.getByText('AB? — 31.0%')).toBeInTheDocument()
  })

  it('não mostra a lista quando não há leituras', () => {
    render(<OcrResult result={makeResult({ plate: null })} />)

    expect(screen.queryByText(/Textos lidos pelo OCR/)).not.toBeInTheDocument()
  })
})

describe('OcrResult com placa lida', () => {
  it('mostra a placa Mercosul com a confiança', () => {
    render(<OcrResult result={makeResult()} />)

    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText(/Mercosul/)).toHaveTextContent('Confiança: 93.4%')
  })

  it('formata a placa antiga com hífen e omite a confiança nula', () => {
    render(
      <OcrResult
        result={makeResult({ plate: 'ABC1234', plate_format: 'antigo', confidence: null })}
      />,
    )

    expect(screen.getByText('ABC-1234')).toBeInTheDocument()
    expect(screen.getByText('Padrão antigo')).toBeInTheDocument()
  })

  it('pede conferência quando a leitura é incerta', () => {
    render(<OcrResult result={makeResult({ needs_review: true })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Leitura incerta')
  })

  it('não mostra verificação oficial quando não foi checada', () => {
    render(
      <OcrResult
        result={makeResult({
          verification: { status: 'not_checked', detail: 'Sem base.', source: null },
        })}
      />,
    )

    expect(screen.queryByText('Sem base.')).not.toBeInTheDocument()
  })

  it('placa irregular vira alerta assertivo com a fonte', () => {
    render(
      <OcrResult
        result={makeResult({
          verification: { status: 'irregular', detail: 'Roubo registrado.', source: 'Senatran' },
        })}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
    expect(alert).toHaveTextContent('Placa com restrição')
    expect(alert).toHaveTextContent('Fonte: Senatran')
  })

  it('placa regular vira status educado e sem fonte quando ela é nula', () => {
    render(
      <OcrResult
        result={makeResult({
          verification: { status: 'regular', detail: 'Tudo certo.', source: null },
        })}
      />,
    )

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByText(/Fonte:/)).not.toBeInTheDocument()
  })

  it('mostra dados de exemplo do veículo com o aviso de que são fictícios', () => {
    render(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({
            schedule: null,
            vehicle_data: { ...realVehicle, is_mock: true },
          }),
        })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent(
      'Veículo: Volvo · FH 540 · 2020 · Branco · MA',
    )
    expect(screen.getByRole('note')).toHaveTextContent('Dados de exemplo')
  })

  it('não mostra resumo do veículo de exemplo quando ele não tem nenhum campo', () => {
    render(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({
            schedule: null,
            vehicle_data: {
              brand: null,
              model: null,
              year: null,
              uf: null,
              color: null,
              is_mock: true,
            },
          }),
        })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.queryByText(/Veículo:/)).not.toBeInTheDocument()
  })
})

describe('OcrResult - seção de check-in', () => {
  it('mostra o agendamento no horário com motorista, carga e data', () => {
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    expect(screen.getByText('Agendado para hoje')).toBeInTheDocument()
    expect(screen.getByText(/Carlos Lima \(12345678909\)/)).toBeInTheDocument()
    expect(screen.getByText(/Documento confere com a foto\./)).toHaveTextContent('✅')
    expect(screen.getByText(/Carga:/)).toHaveTextContent('Soja (Não perecível), Ácido (Químico)')
    expect(screen.getByText('Data agendada: 10/03/2026')).toBeInTheDocument()
  })

  it('avisa chegada adiantada e documento que precisa de conferência', () => {
    render(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({
            schedule: {
              ...schedule,
              status: 'early',
              driver_document_validated: false,
              driver_document_validation_detail: 'Número diferente.',
            },
          }),
        })}
      />,
    )

    expect(screen.getByText(/Motorista chegou adiantado!/)).toHaveTextContent('10/03/2026')
    expect(screen.getByText(/Número diferente\./)).toHaveTextContent('⚠️')
  })

  it('mostra a confirmação do veículo real, mas não a do veículo de exemplo', () => {
    const { rerender } = render(
      <OcrResult result={makeResult({ checkin: makeCheckin({ vehicle_data: realVehicle }) })} />,
    )
    expect(screen.getByText(/Confirmação do veículo/)).toHaveTextContent('Volvo')

    rerender(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({ vehicle_data: { ...realVehicle, is_mock: true } }),
        })}
      />,
    )
    expect(screen.queryByText(/Confirmação do veículo/)).not.toBeInTheDocument()
  })

  it('sem agendamento mas com veículo encontrado, pede conferência manual', () => {
    render(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({ schedule: null, vehicle_data: realVehicle }),
        })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.getByText('Sem agendamento cadastrado')).toBeInTheDocument()
    expect(screen.getByText(/Veículo: Volvo/)).toBeInTheDocument()
  })

  it('sem agendamento e com veículo de exemplo não repete o resumo do veículo', () => {
    render(
      <OcrResult
        result={makeResult({
          checkin: makeCheckin({
            schedule: null,
            vehicle_data: { ...realVehicle, is_mock: true },
          }),
        })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.getAllByText(/Volvo/)).toHaveLength(1)
  })

  it('sem agendamento e sem veículo, avisa que a placa não foi reconhecida', () => {
    render(
      <OcrResult
        result={makeResult({ checkin: makeCheckin({ schedule: null, vehicle_data: null }) })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.getByText(/Placa não reconhecida em nenhuma fonte/)).toHaveAttribute(
      'role',
      'alert',
    )
  })
})

describe('OcrResult - fotos do documento', () => {
  it('só mostra os botões de foto para quem pode ver agendamentos', () => {
    const { rerender } = render(
      <OcrResult result={makeResult({ checkin: makeCheckin() })} access={NO_ACCESS} />,
    )
    expect(
      screen.queryByRole('button', { name: 'Ver frente do documento' }),
    ).not.toBeInTheDocument()

    rerender(
      <OcrResult
        result={makeResult({ checkin: makeCheckin() })}
        access={{ ...NO_ACCESS, viewSchedules: true }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Ver frente do documento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver verso do documento' })).toBeInTheDocument()
  })

  it.each([
    ['frente', 'Ver frente do documento', frontPhotoMock],
    ['verso', 'Ver verso do documento', backPhotoMock],
  ])('abre a foto do %s do documento em outra aba', async (_lado, buttonName, photoMock) => {
    const user = userEvent.setup()
    const preview = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window)
    photoMock.mockResolvedValue(new Blob(['img']))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: buttonName }))

    await waitFor(() => expect(preview.location.href).toBe('blob:mock-url'))
    expect(photoMock).toHaveBeenCalledWith(10)
    expect(preview.close).not.toHaveBeenCalled()
  })

  it('fecha a aba em branco quando a foto não carrega', async () => {
    const user = userEvent.setup()
    const preview = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window)
    frontPhotoMock.mockRejectedValue(new ApiError('Sem foto.', 404))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Ver frente do documento' }))

    await waitFor(() => expect(preview.close).toHaveBeenCalledOnce())
  })

  it('não quebra quando o navegador bloqueia a nova aba', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'open').mockReturnValue(null)
    backPhotoMock.mockResolvedValue(new Blob(['img']))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Ver verso do documento' }))

    await waitFor(() => expect(backPhotoMock).toHaveBeenCalled())
    expect(screen.getByText('Agendado para hoje')).toBeInTheDocument()
  })

  it('não quebra quando a aba foi bloqueada e a foto falha', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'open').mockReturnValue(null)
    backPhotoMock.mockRejectedValue(new Error('x'))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Ver verso do documento' }))

    await waitFor(() => expect(backPhotoMock).toHaveBeenCalled())
  })
})

describe('OcrResult - decisão de entrada', () => {
  it('autoriza a entrada e registra o check-in existente', async () => {
    const user = userEvent.setup()
    createCheckinMock.mockResolvedValue({} as Awaited<ReturnType<typeof createCheckin>>)
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Autorizar entrada' }))

    expect(createCheckinMock).toHaveBeenCalledWith('ABC1D23', 'admitted', 10, 55)
    expect(await screen.findByText('Entrada autorizada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Autorizar entrada' })).not.toBeInTheDocument()
  })

  it('recusa a entrada', async () => {
    const user = userEvent.setup()
    createCheckinMock.mockResolvedValue({} as Awaited<ReturnType<typeof createCheckin>>)
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Recusar entrada' }))

    expect(createCheckinMock).toHaveBeenCalledWith('ABC1D23', 'cancelled', 10, 55)
    expect(await screen.findByText('Entrada recusada.')).toBeInTheDocument()
  })

  it('só mostra o botão que o cargo permite', () => {
    render(
      <OcrResult
        result={makeResult({ checkin: makeCheckin() })}
        access={{ ...NO_ACCESS, authorize: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Autorizar entrada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recusar entrada' })).not.toBeInTheDocument()
  })

  it('avisa quando o cargo não pode autorizar nem recusar', () => {
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} access={NO_ACCESS} />)

    expect(
      screen.getByText('Seu cargo não pode autorizar nem recusar entradas.'),
    ).toBeInTheDocument()
  })

  it('mostra a mensagem da API quando registrar a decisão falha', async () => {
    const user = userEvent.setup()
    createCheckinMock.mockRejectedValue(new ApiError('Sem permissão.', 403))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Autorizar entrada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão.')
    expect(screen.getByRole('button', { name: 'Autorizar entrada' })).toBeEnabled()
  })

  it('usa mensagem padrão para erro inesperado', async () => {
    const user = userEvent.setup()
    createCheckinMock.mockRejectedValue(new Error('boom'))
    render(<OcrResult result={makeResult({ checkin: makeCheckin() })} />)

    await user.click(screen.getByRole('button', { name: 'Recusar entrada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erro inesperado ao registrar a decisão.',
    )
  })

  it('sem agendamento, quem pode cadastrar é orientado a cadastrar e não decide', () => {
    render(
      <OcrResult
        result={makeResult({ checkin: makeCheckin({ schedule: null, checkin_id: null }) })}
        access={{ ...NO_ACCESS, registerArrival: true }}
      />,
    )

    expect(screen.getByText(/Cadastre motorista, carga e caminhão abaixo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Autorizar entrada' })).not.toBeInTheDocument()
  })

  it('sem agendamento, quem não pode cadastrar é orientado a chamar o Planejador', () => {
    render(
      <OcrResult
        result={makeResult({ checkin: makeCheckin({ schedule: null }) })}
        access={NO_ACCESS}
      />,
    )

    expect(screen.getByText(/Peça ao Planejador ou ao Supervisor/)).toBeInTheDocument()
  })

  it('não mostra decisão quando não há contexto de check-in', () => {
    render(<OcrResult result={makeResult({ checkin: null })} />)

    expect(screen.queryByRole('button', { name: 'Autorizar entrada' })).not.toBeInTheDocument()
  })
})
