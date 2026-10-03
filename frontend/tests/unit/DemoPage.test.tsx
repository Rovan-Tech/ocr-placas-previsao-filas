import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DemoPage from '../../src/pages/DemoPage'
import {
  ApiError,
  fetchDemoSamples,
  submitDemoOcr,
  type DemoPlateReadResponse,
} from '../../src/services/api'
import { renderPage } from './support/render'

vi.mock('../../src/components/CameraCapture', async () => ({
  default: (await import('./support/cameraMock')).default,
}))
vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  fetchDemoSamples: vi.fn(),
  submitDemoOcr: vi.fn(),
}))

const fetchSamplesMock = vi.mocked(fetchDemoSamples)
const submitMock = vi.mocked(submitDemoOcr)

const samples = [
  { id: 's1', plate: 'ABC1D23', description: 'Placa Mercosul limpa' },
  { id: 's2', plate: 'XYZ-9876', description: 'Placa antiga suja' },
]

const readOk: DemoPlateReadResponse = {
  plate: 'ABC1D23',
  plate_format: 'mercosul',
  confidence: 0.97,
  needs_review: false,
  detections: [{ text: 'ABC1D23', confidence: 0.97 }],
}

beforeEach(() => {
  fetchSamplesMock.mockReset().mockResolvedValue(samples)
  submitMock.mockReset()
})

describe('DemoPage', () => {
  it('lista as placas de exemplo depois de carregar', async () => {
    renderPage(<DemoPage />)

    expect(screen.getByText('Carregando exemplos…')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Placa Mercosul limpa/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Placa antiga suja/ })).toBeInTheDocument()
    expect(screen.getByText(/Modo de demonstração/)).toBeInTheDocument()
  })

  it('mostra erro quando os exemplos não carregam, mas ainda deixa enviar foto', async () => {
    fetchSamplesMock.mockRejectedValue(new ApiError('Fora do ar.', 503))
    renderPage(<DemoPage />)

    expect(await screen.findByText('Fora do ar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simular captura' })).toBeInTheDocument()
  })

  it('usa mensagem padrão quando o erro dos exemplos não é da API', async () => {
    fetchSamplesMock.mockRejectedValue(new Error('x'))
    renderPage(<DemoPage />)

    expect(await screen.findByText('Erro ao carregar os exemplos.')).toBeInTheDocument()
  })

  it('lê uma placa de exemplo e mostra o resultado sem decisão de entrada', async () => {
    const user = userEvent.setup()
    submitMock.mockResolvedValue(readOk)
    renderPage(<DemoPage />)

    await user.click(await screen.findByRole('button', { name: /Placa Mercosul limpa/ }))

    expect(submitMock).toHaveBeenCalledWith({ sampleId: 's1' })
    expect(await screen.findByText('Placa lida')).toBeInTheDocument()
    expect(screen.getByText(/Confiança: 97.0%/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Autorizar entrada' })).not.toBeInTheDocument()
    expect(screen.queryByText('Escolher uma placa de exemplo')).not.toBeInTheDocument()
  })

  it('envia a foto do usuário e permite testar outra placa', async () => {
    const user = userEvent.setup()
    submitMock.mockResolvedValue(readOk)
    renderPage(<DemoPage />)
    await screen.findByRole('button', { name: /Placa Mercosul limpa/ })

    await user.click(screen.getByRole('button', { name: 'Simular captura' }))

    expect(submitMock).toHaveBeenCalledWith({ file: expect.any(File) })
    await user.click(await screen.findByRole('button', { name: 'Testar outra placa' }))
    expect(screen.getByText('Escolher uma placa de exemplo')).toBeInTheDocument()
    expect(screen.queryByText('Placa lida')).not.toBeInTheDocument()
  })

  it('mostra o processamento enquanto lê', async () => {
    const user = userEvent.setup()
    submitMock.mockReturnValue(new Promise(() => {}))
    renderPage(<DemoPage />)

    await user.click(await screen.findByRole('button', { name: /Placa Mercosul limpa/ }))

    expect(screen.getByText('EM PROCESSAMENTO')).toBeInTheDocument()
    expect(screen.queryByText('Escolher uma placa de exemplo')).not.toBeInTheDocument()
  })

  it('mostra a mensagem da API e volta a oferecer as opções quando a leitura falha', async () => {
    const user = userEvent.setup()
    submitMock.mockRejectedValue(new ApiError('Muitas tentativas.', 429))
    renderPage(<DemoPage />)

    await user.click(await screen.findByRole('button', { name: /Placa Mercosul limpa/ }))

    expect(await screen.findByText('Muitas tentativas.')).toBeInTheDocument()
    expect(screen.getByText('Escolher uma placa de exemplo')).toBeInTheDocument()
  })

  it('usa mensagem padrão para erro inesperado na leitura', async () => {
    const user = userEvent.setup()
    submitMock.mockRejectedValue(new Error('boom'))
    renderPage(<DemoPage />)

    await user.click(await screen.findByRole('button', { name: /Placa Mercosul limpa/ }))

    expect(
      await screen.findByText('Erro inesperado ao rodar a leitura de demonstração.'),
    ).toBeInTheDocument()
  })

  it('leitura incerta aparece como incerta, sem placa válida aparece o aviso', async () => {
    const user = userEvent.setup()
    submitMock.mockResolvedValue({ ...readOk, plate: null, plate_format: null, confidence: null })
    renderPage(<DemoPage />)

    await user.click(await screen.findByRole('button', { name: /Placa Mercosul limpa/ }))

    expect(await screen.findByText(/Nenhuma placa em formato válido/)).toBeInTheDocument()
  })
})
