import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCanvasStub, installImageStub, makeStream, setVideoSize } from './support/camera'

const getUserMedia = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: (...args: unknown[]) => getUserMedia(...args) },
    configurable: true,
  })
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
})

import CameraCapture from '../../src/components/CameraCapture'

function renderCamera(props: Partial<React.ComponentProps<typeof CameraCapture>> = {}) {
  const onCapture = vi.fn()
  const view = render(<CameraCapture onCapture={onCapture} {...props} />)
  return { onCapture, ...view }
}

async function openCamera(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Abrir câmera/ }))
  await screen.findByRole('button', { name: 'Tirar foto' })
}

function getVideo(container: HTMLElement) {
  return container.querySelector('video') as HTMLVideoElement
}

beforeEach(() => {
  getUserMedia.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CameraCapture com câmera ao vivo', () => {
  it('oferece abrir a câmera e enviar foto do aparelho', () => {
    renderCamera()

    expect(screen.getByRole('button', { name: /Abrir câmera/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Enviar foto do aparelho' })).toBeEnabled()
    expect(screen.getByText('Aponte a câmera para a placa do caminhão')).toBeInTheDocument()
  })

  it('desabilita os botões quando o componente está desabilitado', () => {
    renderCamera({ disabled: true })

    expect(screen.getByRole('button', { name: /Abrir câmera/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar foto do aparelho' })).toBeDisabled()
  })

  it('abre a câmera traseira e só libera a foto quando o vídeo carrega', async () => {
    const user = userEvent.setup()
    const { stream } = makeStream()
    getUserMedia.mockResolvedValue(stream)
    const { container } = renderCamera()

    await openCamera(user)

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    })
    expect(getVideo(container).srcObject).toBe(stream)
    expect(screen.queryByText('Aponte a câmera para a placa do caminhão')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled()
    fireEvent.loadedData(getVideo(container))
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeEnabled()
  })

  it('tira a foto, reduz para no máximo 1600px, encerra a câmera e entrega um JPEG', async () => {
    const user = userEvent.setup()
    const { stream, stop } = makeStream()
    getUserMedia.mockResolvedValue(stream)
    const { drawImage, toBlob } = installCanvasStub()
    const { container, onCapture } = renderCamera()
    await openCamera(user)
    setVideoSize(getVideo(container), 3200, 1600)
    fireEvent.loadedData(getVideo(container))

    await user.click(screen.getByRole('button', { name: 'Tirar foto' }))

    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce())
    const file = onCapture.mock.calls[0]![0] as File
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toMatch(/^placa-\d+\.jpg$/)
    expect(drawImage).toHaveBeenCalledWith(getVideo(container), 0, 0, 1600, 800)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85)
    expect(stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Abrir câmera/ })).toBeInTheDocument()
  })

  it('não amplia fotos pequenas', async () => {
    const user = userEvent.setup()
    getUserMedia.mockResolvedValue(makeStream().stream)
    const { drawImage } = installCanvasStub()
    const { container, onCapture } = renderCamera()
    await openCamera(user)
    setVideoSize(getVideo(container), 640, 480)
    fireEvent.loadedData(getVideo(container))

    await user.click(screen.getByRole('button', { name: 'Tirar foto' }))

    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 480)
  })

  it.each([
    ['o navegador não gera o blob', { toBlobResult: null }],
    ['o canvas 2D não é suportado', { hasContext: false }],
  ])('avisa quando %s ao tirar a foto', async (_nome, canvasOptions) => {
    const user = userEvent.setup()
    getUserMedia.mockResolvedValue(makeStream().stream)
    installCanvasStub(canvasOptions)
    const { container, onCapture } = renderCamera()
    await openCamera(user)
    setVideoSize(getVideo(container), 800, 600)
    fireEvent.loadedData(getVideo(container))

    await user.click(screen.getByRole('button', { name: 'Tirar foto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar a foto. Tente novamente.',
    )
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('cancelar encerra a câmera e volta ao estado inicial', async () => {
    const user = userEvent.setup()
    const { stream, stop } = makeStream()
    getUserMedia.mockResolvedValue(stream)
    renderCamera()
    await openCamera(user)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Abrir câmera/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar foto' })).not.toBeInTheDocument()
  })

  it('encerra a câmera ao desmontar', async () => {
    const user = userEvent.setup()
    const { stream, stop } = makeStream()
    getUserMedia.mockResolvedValue(stream)
    const { unmount } = renderCamera()
    await openCamera(user)

    unmount()

    expect(stop).toHaveBeenCalled()
  })

  it('explica quando a permissão da câmera é negada', async () => {
    const user = userEvent.setup()
    getUserMedia.mockRejectedValue(new DOMException('negado', 'NotAllowedError'))
    renderCamera()

    await user.click(screen.getByRole('button', { name: /Abrir câmera/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Permissão da câmera negada.')
  })

  it('sugere enviar uma foto quando a câmera não abre por outro motivo', async () => {
    const user = userEvent.setup()
    getUserMedia.mockRejectedValue(new Error('sem câmera'))
    renderCamera()

    await user.click(screen.getByRole('button', { name: /Abrir câmera/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir a câmera.')
  })

  it('limpa o erro ao tentar abrir a câmera de novo', async () => {
    const user = userEvent.setup()
    getUserMedia
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce(makeStream().stream)
    renderCamera()
    await user.click(screen.getByRole('button', { name: /Abrir câmera/ }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /Abrir câmera/ }))

    await screen.findByRole('button', { name: 'Tirar foto' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o botão de enviar foto aciona o seletor de arquivo', async () => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderCamera()

    await user.click(screen.getByRole('button', { name: 'Enviar foto do aparelho' }))

    expect(click).toHaveBeenCalled()
  })

  it('reduz e converte para JPEG a foto escolhida no aparelho', async () => {
    const user = userEvent.setup()
    installImageStub({ width: 4000, height: 3000 })
    const { drawImage } = installCanvasStub()
    const { container, onCapture } = renderCamera()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, new File(['png'], 'caminhao.png', { type: 'image/png' }))

    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce())
    const file = onCapture.mock.calls[0]![0] as File
    expect(file.name).toBe('caminhao.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('ignora a escolha de arquivo vazia', () => {
    const { container, onCapture } = renderCamera()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [] } })

    expect(onCapture).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('avisa quando a imagem escolhida não pode ser lida', async () => {
    const user = userEvent.setup()
    installImageStub('error')
    const { container, onCapture } = renderCamera()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, new File(['x'], 'quebrada.png', { type: 'image/png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível processar a foto enviada. Tente outra.',
    )
    expect(onCapture).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
})
