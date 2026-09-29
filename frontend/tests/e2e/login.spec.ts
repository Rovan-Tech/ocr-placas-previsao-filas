import { expect, test, type Page } from '@playwright/test'
import { FAKE_EMPLOYEE } from './testAuth'

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test.describe('login — tema claro de alto contraste', () => {
  test('botão Entrar é verde escuro com texto branco, e os campos têm borda de 2px', async ({ page }) => {
    await page.goto('/')

    const submit = page.getByRole('button', { name: 'Entrar' })
    await expect(submit).toHaveCSS('background-color', 'rgb(11, 110, 76)')
    await expect(submit).toHaveCSS('color', 'rgb(255, 255, 255)')

    const username = page.getByLabel('Usuário')
    await expect(username).toHaveCSS('border-top-width', '2px')
    await expect(username).toHaveCSS('border-top-color', 'rgb(107, 125, 112)')
    await expect(username).toHaveCSS('color', 'rgb(15, 27, 21)')
    await expect(page.getByRole('link', { name: 'Testar sem login' })).toHaveCSS('color', 'rgb(11, 110, 76)')
  })

  test('o corpo do texto usa IBM Plex Sans', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByLabel('Usuário')).toHaveCSS('font-family', /IBM Plex Sans/)
    await expect(page.getByRole('heading', { name: 'Porto Baía Verde' })).toHaveCSS('font-family', /Space Grotesk/)
  })

  test('alternar para o tema escuro troca as cores do login e continua utilizável', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('switch', { name: /Mudar para tema escuro/ }).click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCSS('background-color', 'rgb(79, 190, 149)')
    await expect(page.getByRole('link', { name: 'Testar sem login' })).toHaveCSS('color', 'rgb(79, 190, 149)')
    await page.getByLabel('Usuário').fill('fiscal')
    await page.getByLabel('Senha', { exact: true }).fill('senhaForte123')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })
})

test.describe('login — tema padrão com o sistema em modo escuro', () => {
  test.use({ colorScheme: 'dark' })

  test('usa o tema claro por padrão, mesmo com o sistema em modo escuro', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCSS('background-color', 'rgb(11, 110, 76)')
  })
})

test.describe('login — layout responsivo', () => {
  test('em desktop, mostra o painel de marca à esquerda e o card de login à direita', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    const panel = page.getByRole('complementary', { name: 'Sobre o sistema' })
    await expect(panel).toBeVisible()
    await expect(
      panel.getByText('Leitura de placas e previsão de fila, do jeito que cada função do time precisa.'),
    ).toBeVisible()
    await expect(panel).toHaveCSS('background-color', 'rgb(13, 26, 22)')

    const panelBox = await panel.boundingBox()
    const formBox = await page.getByLabel('Usuário').boundingBox()
    expect(panelBox?.width).toBe(560)
    expect(formBox && panelBox && formBox.x > panelBox.x + panelBox.width).toBe(true)
    await expect(page.getByLabel('Usuário')).toBeVisible()
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })

  test('em mobile, esconde o painel de marca e mostra só o card, sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await expect(page.getByRole('complementary', { name: 'Sobre o sistema' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Porto Baía Verde' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeInViewport()
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })

  test('em mobile, o botão Entrar e o alternador de senha têm alvo de toque adequado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const submitBox = await page.getByRole('button', { name: 'Entrar' }).boundingBox()
    expect(submitBox?.height).toBeGreaterThanOrEqual(44)

    const toggleBox = await page.getByRole('button', { name: 'Mostrar senha' }).boundingBox()
    expect(toggleBox?.height).toBeGreaterThanOrEqual(24)
  })

  test('a tela de troca de senha não herda o layout do login', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'token-de-teste',
          token_type: 'bearer',
          employee: FAKE_EMPLOYEE,
          must_change_password: true,
        }),
      }),
    )
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.getByLabel('Usuário').fill('fiscal.teste')
    await page.getByLabel('Senha', { exact: true }).fill('temp12345')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('heading', { name: 'Troque sua senha' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Sobre o sistema' })).toHaveCount(0)
  })
})
