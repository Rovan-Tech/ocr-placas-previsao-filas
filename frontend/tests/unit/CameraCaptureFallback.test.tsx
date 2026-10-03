import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CameraCapture from '../../src/components/CameraCapture'

describe('CameraCapture sem câmera ao vivo (ex.: HTTP em rede local)', () => {
  it('não oferece abrir a câmera e destaca o botão de fotografar', () => {
    render(<CameraCapture onCapture={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Abrir câmera/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fotografar placa' })).toHaveClass('primary')
  })

  it('o botão de fotografar aciona o seletor de arquivo com captura traseira', async () => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    const { container } = render(<CameraCapture onCapture={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Fotografar placa' }))

    expect(click).toHaveBeenCalled()
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })
})
