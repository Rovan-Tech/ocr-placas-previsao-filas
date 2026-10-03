import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CapturePage from '../../src/pages/CapturePage'
import {
  ApiError,
  submitPlateManually,
  uploadPlateImage,
  type OcrUploadResponse,
} from '../../src/services/api'
import type { PermissionKey } from '../../src/services/roles'
import { setAuth } from './support/authMock'
import { makeEmployee } from './support/fixtures'
import { renderPage } from './support/render'
import { registeredSchedule, scheduleFormCreated } from './support/scheduleFormState'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/components/CameraCapture', async () => ({
  default: (await import('./support/cameraMock')).default,
}))
vi.mock('../../src/components/ScheduleForm', async () => ({
  default: (await import('./support/scheduleFormMock')).default,
}))
vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  uploadPlateImage: vi.fn(),
  submitPlateManually: vi.fn(),
  createCheckin: vi.fn(),
}))

const uploadMock = vi.mocked(uploadPlateImage)
const manualMock = vi.mocked(submitPlateManually)

function makeResult(overrides: Partial<OcrUploadResponse> = {}): OcrUploadResponse {
  return {
    filename: 'placa.jpg',
    plate: 'ABC1D23',
    plate_format: 'mercosul',
    confidence: 0.95,
    needs_review: false,
    verification: null,
    detections: [],
    checkin: null,
    ...overrides,
  }
}

const unscheduledCheckin = { found: false, schedule: null, vehicle_data: null, checkin_id: 3 }

function withPermissions(permissions: PermissionKey[]) {
  setAuth({ employee: makeEmployee({ permissions }) })
}

beforeEach(() => {
  setAuth()
  uploadMock.mockReset()
  manualMock.mockReset()
})

async function capturePhoto(user: ReturnType<typeof userEvent.setup>) {
  renderPage(<CapturePage />)
  await user.click(screen.getByRole('button', { name: 'Simular captura' }))
}

describe('CapturePage - captura e confirmação da foto', () => {
  it('começa pedindo a foto e oferece a digitação manual', () => {
    renderPage(<CapturePage />)

    expect(screen.getByRole('heading', { name: 'Capturar placa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Digitar a placa manualmente' })).toBeInTheDocument()
  })

  it('mostra a foto capturada e pergunta se a placa está legível', async () => {
    const user = userEvent.setup()
    await capturePhoto(user)

    expect(screen.getByRole('img', { name: 'Foto tirada da placa' })).toHaveAttribute(
      'src',
      'blob:mock-url',
    )
    expect(screen.getByText('A foto ficou nítida e a placa está legível?')).toBeInTheDocument()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('"Não, tirar outra" descarta a foto e volta ao início', async () => {
    const user = userEvent.setup()
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Não, tirar outra' }))

    expect(screen.queryByRole('img', { name: 'Foto tirada da placa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simular captura' })).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('libera a foto anterior ao capturar outra', async () => {
    const user = userEvent.setup()
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Não, tirar outra' }))

    await user.click(screen.getByRole('button', { name: 'Simular captura' }))

    expect(screen.getByRole('img', { name: 'Foto tirada da placa' })).toBeInTheDocument()
  })
})

describe('CapturePage - leitura', () => {
  it('envia a foto, mostra o processamento e depois a placa confirmada', async () => {
    const user = userEvent.setup()
    let release: (value: OcrUploadResponse) => void = () => {}
    uploadMock.mockReturnValue(new Promise((resolve) => (release = resolve)))
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))
    expect(screen.getByText('EM PROCESSAMENTO')).toBeInTheDocument()
    expect(uploadMock).toHaveBeenCalledWith(expect.any(File))
    release(makeResult())

    expect(await screen.findByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova foto' })).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível confirmar a placa/)).not.toBeInTheDocument()
  })

  it('"Nova foto" volta ao início depois de confirmar', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult())
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(await screen.findByRole('button', { name: 'Nova foto' }))

    expect(screen.getByRole('button', { name: 'Simular captura' })).toBeInTheDocument()
    expect(screen.queryByText('ABC1D23')).not.toBeInTheDocument()
  })

  it('avisa quando o resguardo da foto não foi salvo', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult({ audit_saved: false }))
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    expect(
      await screen.findByText(/não foi possível guardar a foto de resguardo/),
    ).toBeInTheDocument()
  })

  it.each([
    ['leitura incerta', makeResult({ needs_review: true })],
    ['nenhuma placa lida', makeResult({ plate: null, plate_format: null, confidence: null })],
  ])('com %s pede nova foto ou digitação em vez de confirmar', async (_nome, result) => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(result)
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    expect(
      await screen.findByText(/Não foi possível confirmar a placa por essa foto/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tirar outra foto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova foto' })).not.toBeInTheDocument()
  })

  it('"Tirar outra foto" volta ao início', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult({ needs_review: true }))
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(await screen.findByRole('button', { name: 'Tirar outra foto' }))

    expect(screen.getByRole('button', { name: 'Simular captura' })).toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Backend fora do ar.'), 'Backend fora do ar.'],
    ['um valor desconhecido', 'x', 'Erro inesperado ao ler a placa.'],
  ])(
    'mostra o erro quando a leitura falha com %s e deixa tentar de novo',
    async (_nome, failure, message) => {
      const user = userEvent.setup()
      uploadMock.mockRejectedValueOnce(failure).mockResolvedValueOnce(makeResult())
      await capturePhoto(user)

      await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

      expect(await screen.findByText('ABC1D23')).toBeInTheDocument()
      expect(uploadMock).toHaveBeenCalledTimes(2)
    },
  )
})

describe('CapturePage - digitação manual', () => {
  it('a partir do início, registra sem foto e mostra o resultado', async () => {
    const user = userEvent.setup()
    manualMock.mockResolvedValue(makeResult({ plate: 'XYZ9K88' }))
    renderPage(<CapturePage />)

    await user.click(screen.getByRole('button', { name: 'Digitar a placa manualmente' }))
    expect(screen.getByRole('heading', { name: 'Digitar a placa' })).toBeInTheDocument()
    expect(screen.queryByText(/A foto será salva/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'xyz9k88')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    expect(await screen.findByText('XYZ9K88')).toBeInTheDocument()
    expect(manualMock).toHaveBeenCalledWith('XYZ9K88', {})
  })

  it('cancelar volta para a tela de captura', async () => {
    const user = userEvent.setup()
    renderPage(<CapturePage />)

    await user.click(screen.getByRole('button', { name: 'Digitar a placa manualmente' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('heading', { name: 'Capturar placa' })).toBeInTheDocument()
  })

  it('"Prefiro digitar a placa" leva a foto junto como resguardo', async () => {
    const user = userEvent.setup()
    manualMock.mockResolvedValue(makeResult())
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Prefiro digitar a placa' }))
    expect(screen.getByText(/A foto será salva junto com a placa digitada/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'abc1d23')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    await screen.findByText('ABC1D23')
    expect(manualMock).toHaveBeenCalledWith('ABC1D23', {
      photo: expect.any(File),
      ocrPlate: null,
      ocrConfidence: null,
    })
  })

  it('depois de uma leitura incerta, leva a placa e a confiança lidas pelo OCR', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(
      makeResult({ plate: 'ABC1D2O', needs_review: true, confidence: 0.41 }),
    )
    manualMock.mockResolvedValue(makeResult())
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(await screen.findByRole('button', { name: 'Digitar manualmente' }))
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'abc1d23')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    await screen.findByText('ABC1D23')
    expect(manualMock).toHaveBeenCalledWith('ABC1D23', {
      photo: expect.any(File),
      ocrPlate: 'ABC1D2O',
      ocrConfidence: 0.41,
    })
  })

  it('depois de um erro de leitura, "Digitar manualmente" abre a digitação com a foto', async () => {
    const user = userEvent.setup()
    uploadMock.mockRejectedValue(new Error('falhou'))
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(await screen.findByRole('button', { name: 'Digitar manualmente' }))

    expect(screen.getByText(/A foto será salva junto com a placa digitada/)).toBeInTheDocument()
  })

  it('"Não é essa placa?" abre a digitação sem a foto', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult())
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(await screen.findByRole('button', { name: 'Digitar manualmente' }))

    expect(screen.getByRole('heading', { name: 'Digitar a placa' })).toBeInTheDocument()
    expect(screen.queryByText(/A foto será salva/)).not.toBeInTheDocument()
  })

  it('erro da API na digitação aparece no formulário', async () => {
    const user = userEvent.setup()
    manualMock.mockRejectedValue(new ApiError('Placa inválida.', 422))
    renderPage(<CapturePage />)

    await user.click(screen.getByRole('button', { name: 'Digitar a placa manualmente' }))
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'xx')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Placa inválida.')
  })
})

describe('CapturePage - chegada sem agendamento', () => {
  it('quem pode cadastrar abre o formulário com a placa travada e passa a poder decidir', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult({ checkin: unscheduledCheckin }))
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))
    await screen.findByText('ABC1D23')
    expect(screen.queryByRole('button', { name: 'Autorizar entrada' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }))
    expect(
      screen.getByRole('heading', { name: 'Cadastrar chegada sem agendamento' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('initial-plate')).toHaveTextContent('ABC1D23')
    await user.click(screen.getByRole('button', { name: 'Simular cadastro' }))

    expect(await screen.findByText('Agendado para hoje')).toBeInTheDocument()
    expect(screen.getByText(/Motorista Novo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autorizar entrada' })).toBeInTheDocument()
  })

  it('ignora o cadastro que termina depois de o fiscal voltar para uma nova foto', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult({ checkin: unscheduledCheckin }))
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))
    await user.click(
      await screen.findByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }),
    )
    const finishRegistration = scheduleFormCreated.current
    await user.click(screen.getByRole('button', { name: 'Nova foto' }))

    act(() => finishRegistration?.(registeredSchedule))

    expect(screen.getByRole('button', { name: 'Simular captura' })).toBeInTheDocument()
    expect(screen.queryByText('Agendado para hoje')).not.toBeInTheDocument()
  })

  it('também oferece o cadastro quando a leitura ficou incerta', async () => {
    const user = userEvent.setup()
    uploadMock.mockResolvedValue(makeResult({ needs_review: true, checkin: unscheduledCheckin }))
    await capturePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await user.click(
      await screen.findByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }),
    )

    expect(
      screen.getByRole('heading', { name: 'Cadastrar chegada sem agendamento' }),
    ).toBeInTheDocument()
  })

  it('quem não pode cadastrar não vê o formulário de chegada', async () => {
    const user = userEvent.setup()
    withPermissions(['capture.read_plate', 'capture.authorize_entry'])
    uploadMock.mockResolvedValue(makeResult({ checkin: unscheduledCheckin }))
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await screen.findByText('ABC1D23')
    expect(
      screen.queryByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }),
    ).not.toBeInTheDocument()
  })

  it('placa com agendamento já existente não oferece o cadastro', async () => {
    const user = userEvent.setup()
    const schedule = {
      id: 1,
      driver_name: 'Carlos',
      driver_document: '123',
      driver_document_validated: true,
      driver_document_validation_detail: 'ok',
      cargo_items: [],
      scheduled_date: '2026-03-10',
      status: 'on_time' as const,
    }
    uploadMock.mockResolvedValue(
      makeResult({ checkin: { found: true, schedule, vehicle_data: null, checkin_id: 1 } }),
    )
    await capturePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Sim, continuar' }))

    await screen.findByText('Agendado para hoje')
    expect(
      screen.queryByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }),
    ).not.toBeInTheDocument()
  })
})
