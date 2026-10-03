import { vi } from 'vitest'

export function installCanvasStub(
  options: { toBlobResult?: Blob | null; hasContext?: boolean } = {},
) {
  const { toBlobResult = new Blob(['jpeg'], { type: 'image/jpeg' }), hasContext = true } = options
  const drawImage = vi.fn()
  const context = hasContext ? { drawImage } : null
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as unknown as HTMLCanvasElement['getContext'],
  )
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback) => callback(toBlobResult))
  return { drawImage, toBlob }
}

export function installImageStub(dimensions: { width: number; height: number } | 'error') {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = dimensions === 'error' ? 0 : dimensions.width
    naturalHeight = dimensions === 'error' ? 0 : dimensions.height
    set src(_value: string) {
      queueMicrotask(() => (dimensions === 'error' ? this.onerror?.() : this.onload?.()))
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

export function makeStream() {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop }
}

export function setVideoSize(video: HTMLVideoElement, width: number, height: number) {
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true })
}
