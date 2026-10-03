import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScheduleForm from '../../src/components/ScheduleForm'
import { ApiError, createSchedule, type ScheduleOut } from '../../src/services/api'
import { fetchCitiesByState } from '../../src/services/locations'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  createSchedule: vi.fn(),
}))
vi.mock('../../src/services/locations', () => ({ fetchCitiesByState: vi.fn() }))

const createScheduleMock = vi.mocked(createSchedule)
const fetchCitiesMock = vi.mocked(fetchCitiesByState)

const VALID_CPF = '11144477735'
const cities = [
  { id: 1, name: 'Imperatriz' },
  { id: 2, name: 'São Luís' },
]

type User = ReturnType<typeof userEvent.setup>

function photo(name: string) {
  return new File(['img'], name, { type: 'image/jpeg' })
}

const createdSchedule = {
  id: 1,
  plate: 'ABC1D23',
  scheduled_date: '2026-03-10',
} as ScheduleOut

beforeEach(() => {
  createScheduleMock.mockReset()
  fetchCitiesMock.mockReset().mockResolvedValue(cities)
})

async function fillEverything(user: User, { skip = '' }: { skip?: string } = {}) {
  const text = async (label: string, value: string) => {
    if (label !== skip) await user.type(screen.getByLabelText(label), value)
  }
  await text('Placa', 'abc1d23')
  await text('Nome do motorista', 'Carlos Lima')
  fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '1980-05-20' } })
  await user.selectOptions(screen.getByLabelText('UF'), 'MA')
  await user.selectOptions(
    await screen.findByLabelText('Local de nascimento (cidade)'),
    'Imperatriz',
  )
  await text('Número do documento', VALID_CPF)
  if (skip !== 'foto-frente')
    await user.upload(
      screen.getByLabelText('Foto da frente do documento do motorista'),
      photo('frente.jpg'),
    )
  await user.upload(
    screen.getByLabelText('Foto do verso do documento do motorista'),
    photo('verso.jpg'),
  )
  await text('Marca do veículo', 'Volvo')
  await text('Modelo do veículo', 'FH 540')
  await text('Ano do veículo', '2020')
  await text('Chassi', '9bwzzz377vt004251')
  await text('Cor do veículo', 'Branco')
  await text('Comprimento (m)', '12.5')
  await text('Altura (m)', '4')
  await text('Largura (m)', '2.6')
  await user.upload(screen.getByLabelText('Foto do documento do veículo'), photo('crlv.jpg'))
  await text('Origem', 'Imperatriz')
  await text('Destino', 'Porto')
  await text('Produto 1', 'Soja')
  fireEvent.change(screen.getByLabelText('Data prevista'), { target: { value: '2026-03-10' } })
  await user.upload(screen.getByLabelText('Foto do manifesto de carga'), photo('manifesto.jpg'))
}

describe('ScheduleForm - estado inicial', () => {
  it('começa com Cadastrar desabilitado e cidade bloqueada até escolher a UF', () => {
    render(<ScheduleForm onCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
    expect(screen.getByLabelText('Local de nascimento (cidade)')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Escolha a UF primeiro' })).toBeInTheDocument()
  })

  it('usa o prefixo de id, a placa e a data iniciais, e trava a placa quando pedido', () => {
    render(
      <ScheduleForm
        idPrefix="arrival"
        initialPlate="XYZ9K88"
        initialScheduledDate="2026-03-10"
        plateReadOnly
        onCreated={vi.fn()}
      />,
    )

    const plate = screen.getByLabelText('Placa')
    expect(plate).toHaveAttribute('id', 'arrival-plate')
    expect(plate).toHaveValue('XYZ9K88')
    expect(plate).toBeDisabled()
    expect(screen.getByLabelText('Data prevista')).toHaveValue('2026-03-10')
  })

  it('converte a placa para maiúsculas', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.type(screen.getByLabelText('Placa'), 'abc1d23')

    expect(screen.getByLabelText('Placa')).toHaveValue('ABC1D23')
  })
})

describe('ScheduleForm - cidade de nascimento', () => {
  it('carrega as cidades da UF escolhida e libera a seleção', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('UF'), 'MA')

    expect(fetchCitiesMock).toHaveBeenCalledWith('MA')
    expect(await screen.findByRole('option', { name: 'Imperatriz' })).toBeInTheDocument()
    expect(screen.getByLabelText('Local de nascimento (cidade)')).toBeEnabled()
  })

  it('mostra carregando enquanto busca as cidades', async () => {
    const user = userEvent.setup()
    fetchCitiesMock.mockReturnValue(new Promise(() => {}))
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('UF'), 'MA')

    expect(screen.getByRole('option', { name: 'Carregando cidades…' })).toBeInTheDocument()
    expect(screen.getByLabelText('Local de nascimento (cidade)')).toBeDisabled()
  })

  it('avisa quando as cidades não carregam e limpa o aviso ao trocar de UF', async () => {
    const user = userEvent.setup()
    fetchCitiesMock.mockRejectedValueOnce(new Error('IBGE fora do ar'))
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('UF'), 'MA')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as cidades dessa UF.',
    )
    await user.selectOptions(screen.getByLabelText('UF'), 'PA')

    await screen.findByRole('option', { name: 'Imperatriz' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignora a resposta atrasada de uma UF anterior', async () => {
    const user = userEvent.setup()
    let releaseMaranhao: (value: typeof cities) => void = () => {}
    fetchCitiesMock
      .mockReturnValueOnce(new Promise((resolve) => (releaseMaranhao = resolve)))
      .mockResolvedValueOnce([{ id: 9, name: 'Belém' }])
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('UF'), 'MA')
    await user.selectOptions(screen.getByLabelText('UF'), 'PA')
    await screen.findByRole('option', { name: 'Belém' })
    releaseMaranhao(cities)

    await waitFor(() => expect(screen.queryByRole('option', { name: 'Imperatriz' })).toBeNull())
    expect(screen.getByRole('option', { name: 'Belém' })).toBeInTheDocument()
  })

  it('ignora o erro atrasado de uma UF anterior', async () => {
    const user = userEvent.setup()
    let failMaranhao: (reason: Error) => void = () => {}
    fetchCitiesMock
      .mockReturnValueOnce(new Promise((_resolve, reject) => (failMaranhao = reject)))
      .mockResolvedValueOnce([{ id: 9, name: 'Belém' }])
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('UF'), 'MA')
    await user.selectOptions(screen.getByLabelText('UF'), 'PA')
    await screen.findByRole('option', { name: 'Belém' })
    failMaranhao(new Error('tarde demais'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('limpa as cidades quando a UF volta a ficar vazia', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('UF'), 'MA')
    await screen.findByRole('option', { name: 'Imperatriz' })

    fireEvent.change(screen.getByLabelText('UF'), { target: { value: '' } })

    expect(screen.queryByRole('option', { name: 'Imperatriz' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Local de nascimento (cidade)')).toBeDisabled()
  })
})

describe('ScheduleForm - documento do motorista', () => {
  it('mostra a dica do tipo escolhido', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    expect(screen.getByText(/o dígito verificador é conferido automaticamente/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'cnh')

    expect(screen.getByText(/9 do número de registro/)).toBeInTheDocument()
  })

  it('CPF aceita só dígitos e limita a 11', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.type(screen.getByLabelText('Número do documento'), '111.444.777-35999')

    expect(screen.getByLabelText('Número do documento')).toHaveValue(VALID_CPF)
    expect(screen.queryByText(/Documento inválido/)).not.toBeInTheDocument()
  })

  it('avisa quando o número completo é inválido, mas não enquanto está incompleto', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.type(screen.getByLabelText('Número do documento'), '1114447')
    expect(screen.queryByText(/Documento inválido/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Número do documento'), '7734')

    expect(screen.getByText('Documento inválido — confira o número digitado.')).toBeInTheDocument()
  })

  it('ao trocar para RG mantém os dígitos e passa a aceitar letras em maiúsculas', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    await user.type(screen.getByLabelText('Número do documento'), '1234567')

    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'rg')
    await user.type(screen.getByLabelText('Número do documento'), 'x')

    expect(screen.getByLabelText('Número do documento')).toHaveValue('1234567X')
    expect(screen.getByLabelText('Número do documento')).toHaveAttribute('inputmode', 'text')
  })

  it('ao voltar de RG para CPF remove as letras', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'rg')
    await user.type(screen.getByLabelText('Número do documento'), '12ab34')

    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'cpf')

    expect(screen.getByLabelText('Número do documento')).toHaveValue('1234')
    expect(screen.getByLabelText('Número do documento')).toHaveAttribute('inputmode', 'numeric')
  })
})

describe('ScheduleForm - veículo e carga', () => {
  it('normaliza o chassi para maiúsculas, sem símbolos e com no máximo 17 caracteres', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await user.type(screen.getByLabelText('Chassi'), '9bw-zzz 377vt004251xyz')

    expect(screen.getByLabelText('Chassi')).toHaveValue('9BWZZZ377VT004251')
  })

  it('adiciona, edita e remove produtos da carga', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Remover produto' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Adicionar produto' }))
    await user.type(screen.getByLabelText('Produto 1'), 'Soja')
    await user.type(screen.getByLabelText('Produto 2'), 'Ácido')
    await user.selectOptions(screen.getAllByLabelText('Categoria')[1]!, 'quimico')
    expect(screen.getAllByLabelText('Categoria')[1]).toHaveValue('quimico')
    expect(screen.getAllByLabelText('Categoria')[0]).toHaveValue('nao_perecivel')
    await user.click(screen.getAllByRole('button', { name: 'Remover produto' })[0]!)

    expect(screen.queryByLabelText('Produto 2')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Produto 1')).toHaveValue('Ácido')
  })
})

describe('ScheduleForm - envio', () => {
  it('habilita Cadastrar só com tudo preenchido e documento válido', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)

    await fillEverything(user)

    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeEnabled()
  })

  it.each([['Nome do motorista'], ['Origem'], ['Produto 1'], ['Placa'], ['foto-frente']])(
    'continua desabilitado quando falta %s',
    async (skip) => {
      const user = userEvent.setup()
      render(<ScheduleForm onCreated={vi.fn()} />)

      await fillEverything(user, { skip })

      expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
    },
  )

  it('continua desabilitado com documento inválido', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    await fillEverything(user, { skip: 'Número do documento' })

    await user.type(screen.getByLabelText('Número do documento'), '11144477700')

    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
  })

  it('remover a foto escolhida volta a bloquear o envio', async () => {
    const user = userEvent.setup()
    render(<ScheduleForm onCreated={vi.fn()} />)
    await fillEverything(user)

    fireEvent.change(screen.getByLabelText('Foto do manifesto de carga'), { target: { files: [] } })

    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
  })

  it('envia os dados ao backend, avisa, limpa o formulário e notifica quem chamou', async () => {
    const user = userEvent.setup()
    createScheduleMock.mockResolvedValue(createdSchedule)
    const onCreated = vi.fn()
    render(<ScheduleForm onCreated={onCreated} />)
    await fillEverything(user)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(createScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: 'ABC1D23',
        driverName: 'Carlos Lima',
        driverBirthDate: '1980-05-20',
        driverBirthPlace: 'Imperatriz',
        driverBirthState: 'MA',
        driverDocumentType: 'cpf',
        driverDocument: VALID_CPF,
        vehicleChassis: '9BWZZZ377VT004251',
        vehicleLengthM: '12.5',
        originLocation: 'Imperatriz',
        destinationLocation: 'Porto',
        cargoItems: [{ productName: 'Soja', category: 'nao_perecivel' }],
        scheduledDate: '2026-03-10',
        driverDocumentPhotoFront: expect.any(File),
        manifestPhoto: expect.any(File),
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Agendamento da placa ABC1D23 cadastrado para 10/03/2026.',
    )
    expect(onCreated).toHaveBeenCalledWith(createdSchedule)
    expect(screen.getByLabelText('Placa')).toHaveValue('')
    expect(screen.getByLabelText('Nome do motorista')).toHaveValue('')
    expect(screen.getByLabelText('Local de nascimento (cidade)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
  })

  it('mantém a placa travada depois de cadastrar quando ela é somente leitura', async () => {
    const user = userEvent.setup()
    createScheduleMock.mockResolvedValue(createdSchedule)
    render(<ScheduleForm initialPlate="ABC1D23" plateReadOnly onCreated={vi.fn()} />)
    await fillEverything(user, { skip: 'Placa' })

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    await screen.findByRole('status')
    expect(screen.getByLabelText('Placa')).toHaveValue('ABC1D23')
  })

  it('bloqueia o formulário enquanto envia', async () => {
    const user = userEvent.setup()
    createScheduleMock.mockReturnValue(new Promise(() => {}))
    render(<ScheduleForm onCreated={vi.fn()} />)
    await fillEverything(user)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(screen.getByRole('button', { name: 'Cadastrando…' })).toBeDisabled()
    expect(screen.getByLabelText('Nome do motorista')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar produto' })).toBeDisabled()
  })

  it('mostra a mensagem da API e preserva o que foi digitado quando o cadastro falha', async () => {
    const user = userEvent.setup()
    createScheduleMock.mockRejectedValue(new ApiError('Placa já agendada.', 409))
    const onCreated = vi.fn()
    render(<ScheduleForm onCreated={onCreated} />)
    await fillEverything(user)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Placa já agendada.')
    expect(screen.getByLabelText('Nome do motorista')).toHaveValue('Carlos Lima')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('usa mensagem padrão para erro inesperado', async () => {
    const user = userEvent.setup()
    createScheduleMock.mockRejectedValue(new Error('boom'))
    render(<ScheduleForm onCreated={vi.fn()} />)
    await fillEverything(user)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erro inesperado ao cadastrar o agendamento.',
    )
  })

  it('não envia quando o formulário é submetido sem as quatro fotos', () => {
    const { container } = render(<ScheduleForm onCreated={vi.fn()} />)

    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    expect(createScheduleMock).not.toHaveBeenCalled()
  })
})
