import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogsPage from '../../src/pages/LogsPage'
import { fetchLogPhoto, fetchLogs, type UploadLogEntry } from '../../src/services/api'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  fetchLogs: vi.fn(),
  fetchLogPhoto: vi.fn(),
}))

const fetchLogsMock = vi.mocked(fetchLogs)
const fetchLogPhotoMock = vi.mocked(fetchLogPhoto)

function makeLog(overrides: Partial<UploadLogEntry> = {}): UploadLogEntry {
  return {
    id: 1,
    employee_id: 1,
    employee_username: 'maria',
    endpoint: 'upload',
    client_ip: '10.0.0.7',
    ocr_plate: 'ABC1D23',
    ocr_confidence: 0.9,
    manual_plate: null,
    final_plate: 'ABC1D23',
    final_plate_format: 'mercosul',
    needs_review: false,
    has_photo: true,
    created_at: '2026-03-10T12:30:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  fetchLogsMock.mockReset()
  fetchLogPhotoMock.mockReset()
})

describe('LogsPage', () => {
  it('mostra carregando e depois a tabela de registros', async () => {
    fetchLogsMock.mockResolvedValue([
      makeLog(),
      makeLog({
        id: 2,
        endpoint: 'manual',
        client_ip: null,
        final_plate: 'ABC1234',
        final_plate_format: 'antigo',
        needs_review: true,
        has_photo: false,
      }),
      makeLog({ id: 3, final_plate: null, final_plate_format: null }),
    ])
    render(<LogsPage />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getAllByText('Foto (OCR)', { selector: 'span' })).toHaveLength(2)
    expect(screen.getByText('Digitação manual')).toBeInTheDocument()
    expect(screen.getByText('ABC-1234')).toBeInTheDocument()
    expect(screen.getByText('incerta')).toBeInTheDocument()
    expect(screen.getByText('Padrão antigo')).toBeInTheDocument()
    expect(screen.getAllByText('10.0.0.7')).toHaveLength(2)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByRole('button', { name: /abrir foto/ })).toHaveLength(2)
  })

  it('mostra o estado vazio', async () => {
    fetchLogsMock.mockResolvedValue([])
    render(<LogsPage />)

    expect(await screen.findByText('Nenhum registro ainda.')).toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Sem permissão.'), 'Sem permissão.'],
    ['um valor desconhecido', 'x', 'Erro ao carregar os logs.'],
  ])('mostra o erro quando a busca falha com %s', async (_nome, failure, message) => {
    fetchLogsMock.mockRejectedValue(failure)
    render(<LogsPage />)

    expect(await screen.findByText(message)).toHaveClass('error')
  })

  it('Atualizar recarrega os registros', async () => {
    const user = userEvent.setup()
    fetchLogsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeLog({ employee_username: 'joao' })])
    render(<LogsPage />)
    await screen.findByText('Nenhum registro ainda.')

    await user.click(screen.getByRole('button', { name: /Atualizar/ }))

    expect(await screen.findByText('joao')).toBeInTheDocument()
    expect(fetchLogsMock).toHaveBeenCalledTimes(2)
  })

  it('abre a foto do registro como link para o blob', async () => {
    const user = userEvent.setup()
    fetchLogsMock.mockResolvedValue([makeLog({ id: 9 })])
    fetchLogPhotoMock.mockResolvedValue(new Blob(['img']))
    render(<LogsPage />)

    await user.click(await screen.findByRole('button', { name: /abrir foto/ }))

    const link = await screen.findByRole('link', { name: /ver foto/ })
    expect(link).toHaveAttribute('href', 'blob:mock-url')
    expect(link).toHaveAttribute('target', '_blank')
    expect(fetchLogPhotoMock).toHaveBeenCalledWith(9)
  })

  it('permite tentar de novo quando a foto falha ao carregar', async () => {
    const user = userEvent.setup()
    fetchLogsMock.mockResolvedValue([makeLog()])
    fetchLogPhotoMock.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(new Blob(['img']))
    render(<LogsPage />)

    await user.click(await screen.findByRole('button', { name: /abrir foto/ }))
    await user.click(await screen.findByRole('button', { name: /falhou, tentar de novo/ }))

    expect(await screen.findByRole('link', { name: /ver foto/ })).toBeInTheDocument()
  })
})
