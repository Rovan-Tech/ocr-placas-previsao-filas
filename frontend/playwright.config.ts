import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Câmera falsa do Chromium: permite testar getUserMedia sem hardware.
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // O fiscal usa o celular na guarita: roda a mesma suíte também em viewport
    // mobile (Pixel 5, Chromium) para pegar quebra de layout e toque.
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  // O backend é mockado nos testes (page.route), então só sobe o Vite.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
