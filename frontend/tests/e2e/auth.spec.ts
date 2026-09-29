import { expect, test, type Page } from '@playwright/test'
import { FAKE_EMPLOYEE, PERMISSIONS, employeeWithRole, loginAsTestUser } from './testAuth'

function mockLogin(page: Page, { status = 200, body }: { status?: number; body: unknown }) {
  return page.route('**/api/auth/login', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

function loginBody(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'token-de-teste',
    token_type: 'bearer',
    employee: FAKE_EMPLOYEE,
    must_change_password: false,
    ...overrides,
  }
}

test('pede login antes de mostrar a tela de captura', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Usuário')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toHaveCount(0)
})

test('alterna entre mostrar e ocultar a senha no login', async ({ page }) => {
  await page.goto('/')

  const passwordInput = page.getByLabel('Senha', { exact: true })
  await passwordInput.fill('senhaForte123')
  await expect(passwordInput).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Mostrar senha' }).click()
  await expect(passwordInput).toHaveAttribute('type', 'text')
  await expect(passwordInput).toHaveValue('senhaForte123')

  await page.getByRole('button', { name: 'Ocultar senha' }).click()
  await expect(passwordInput).toHaveAttribute('type', 'password')
})

test('faz login com usuário e senha e mostra a tela de captura', async ({ page }) => {
  let sentForm: string | null = null
  await page.route('**/api/auth/login', (route) => {
    sentForm = route.request().postData()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(loginBody()) })
  })
  await page.goto('/')

  await page.getByLabel('Usuário').fill('fiscal.teste')
  await page.getByLabel('Senha', { exact: true }).fill('senhaForte123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toBeVisible()
  await expect(page.getByText('Fiscal de Teste')).toBeVisible()
  expect(sentForm).toContain('username=fiscal.teste')
  expect(sentForm).toContain('password=senhaForte123')
})

test('login numa página que busca dados sozinha ao montar não cai de volta pro login', async ({
  page,
}) => {
  await mockLogin(page, { body: loginBody() })
  await page.route('**/api/schedules', (route) => {
    const authorization = route.request().headers()['authorization']
    if (authorization !== 'Bearer token-de-teste') {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Não autenticado.' }),
      })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.goto('/agendamentos')

  await page.getByLabel('Usuário').fill('fiscal.teste')
  await page.getByLabel('Senha', { exact: true }).fill('senhaForte123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('heading', { name: 'Agendamentos' })).toBeVisible()
  await expect(page.getByLabel('Usuário')).toHaveCount(0)
})

test('mostra o erro do backend quando o login falha', async ({ page }) => {
  await mockLogin(page, { status: 401, body: { detail: 'Usuário ou senha inválidos.' } })
  await page.goto('/')

  await page.getByLabel('Usuário').fill('fiscal.teste')
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible()
  await expect(page.getByLabel('Usuário')).toBeVisible()
})

test('login com senha temporária leva direto pra tela de trocar senha', async ({ page }) => {
  await mockLogin(page, { body: loginBody({ must_change_password: true }) })
  await page.goto('/')

  await page.getByLabel('Usuário').fill('fiscal.novo')
  await page.getByLabel('Senha', { exact: true }).fill('temp12345')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('heading', { name: 'Troque sua senha' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toHaveCount(0)
})

test('troca a senha e, depois, usa o sistema normalmente', async ({ page }) => {
  await mockLogin(page, { body: loginBody({ must_change_password: true }) })
  await page.route('**/api/auth/change-password', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_EMPLOYEE) }),
  )
  await page.goto('/')
  await page.getByLabel('Usuário').fill('fiscal.novo')
  await page.getByLabel('Senha', { exact: true }).fill('temp12345')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.getByLabel('Senha atual').fill('temp12345')
  await page.getByLabel('Nova senha', { exact: true }).fill('umaSenhaBemForte1')
  await page.getByLabel('Confirme a nova senha').fill('umaSenhaBemForte1')
  await page.getByRole('button', { name: 'Trocar senha' }).click()

  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toBeVisible()
})

test('recusa trocar a senha quando a confirmação não bate', async ({ page }) => {
  await mockLogin(page, { body: loginBody({ must_change_password: true }) })
  await page.goto('/')
  await page.getByLabel('Usuário').fill('fiscal.novo')
  await page.getByLabel('Senha', { exact: true }).fill('temp12345')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.getByLabel('Senha atual').fill('temp12345')
  await page.getByLabel('Nova senha', { exact: true }).fill('umaSenhaBemForte1')
  await page.getByLabel('Confirme a nova senha').fill('outraSenhaDiferente')
  await page.getByRole('button', { name: 'Trocar senha' }).click()

  await expect(page.getByText('As duas senhas digitadas são diferentes.')).toBeVisible()
})

test('sair volta pra tela de login', async ({ page }) => {
  await loginAsTestUser(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()

  await expect(page.getByLabel('Usuário')).toBeVisible()
})

test('uma resposta 401 numa chamada normal desloga e volta pro login', async ({ page }) => {
  await loginAsTestUser(page)
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Sessão inválida ou expirada. Faça login de novo.' }),
    }),
  )
  await page.goto('/checkins')

  await expect(page.getByLabel('Usuário')).toBeVisible()
})

test.describe('admin master cadastra funcionário', () => {
  test('link de cadastro só aparece pra admin', async ({ page }) => {
    await loginAsTestUser(page, FAKE_EMPLOYEE)
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Funcionários' })).toHaveCount(0)
  })

  test('admin cadastra um funcionário com senha temporária', async ({ page }) => {
    await loginAsTestUser(page, employeeWithRole('admin'))
    let sentBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/employees', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([FAKE_EMPLOYEE]),
        })
      }
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          username: 'fiscal.novo',
          full_name: 'Fiscal Novo',
          role: 'fiscal',
          active: true,
        }),
      })
    })
    await page.goto('/')

    await page.getByRole('link', { name: /Funcionários|Equipe/ }).click()
    await page.getByLabel('Usuário').fill('fiscal.novo')
    await page.getByLabel('Nome completo').fill('Fiscal Novo')
    await page.getByLabel('Senha temporária').fill('temp12345')
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    await expect(page.getByText(/Fiscal Novo.*cadastrado/)).toBeVisible()
    expect(sentBody).toMatchObject({
      username: 'fiscal.novo',
      full_name: 'Fiscal Novo',
      temporary_password: 'temp12345',
    })
  })

  test('não-admin não vê nem acessa a rota de cadastro', async ({ page }) => {
    await loginAsTestUser(page, FAKE_EMPLOYEE)
    await page.goto('/funcionarios')

    await expect(page.getByRole('heading', { name: 'Funcionários' })).toHaveCount(0)
  })
})

test.describe('admin master exclui funcionário', () => {
  const ADMIN = {
    ...employeeWithRole('admin'),
    id: 1,
    username: 'admin',
    full_name: 'Admin Master',
  }
  const OTHER = {
    id: 2,
    username: 'fiscal.maria',
    full_name: 'Maria Fiscal',
    role: 'fiscal',
    active: true,
  }

  async function openEmployeesPage(
    page: Page,
    { onDelete }: { onDelete?: (route: import('@playwright/test').Route) => Promise<void> } = {},
  ) {
    await loginAsTestUser(page, ADMIN)
    await page.route('**/api/auth/employees', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([ADMIN, OTHER]),
        })
      }
      return route.continue()
    })
    if (onDelete) {
      await page.route('**/api/auth/employees/2', (route) =>
        route.request().method() === 'DELETE' ? onDelete(route) : route.continue(),
      )
    }
    await page.goto('/funcionarios')
  }

  test('não tem botão de excluir na própria linha do admin', async ({ page }) => {
    await openEmployeesPage(page)

    const adminRow = page.getByRole('row', { name: /Admin Master/ })
    await expect(adminRow.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
  })

  test('mostra os dados do funcionário antes de excluir, e cancelar não chama a API', async ({
    page,
  }) => {
    let called = false
    await openEmployeesPage(page, {
      onDelete: async (route) => {
        called = true
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ...OTHER, active: false }),
        })
      },
    })

    await page
      .getByRole('row', { name: /Maria Fiscal/ })
      .getByRole('button', { name: 'Excluir' })
      .click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Maria Fiscal')
    await expect(dialog).toContainText('fiscal.maria')
    await expect(dialog).toContainText('Fiscal')

    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(called).toBe(false)
  })

  test('confirmar exclui o funcionário e atualiza a situação na tabela', async ({ page }) => {
    await openEmployeesPage(page, {
      onDelete: async (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ...OTHER, active: false }),
        }),
    })

    await page
      .getByRole('row', { name: /Maria Fiscal/ })
      .getByRole('button', { name: 'Excluir' })
      .click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sim, excluir' }).click()

    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    const row = page.getByRole('row', { name: /Maria Fiscal/ })
    await expect(row).toContainText('Excluído')
    await expect(row.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
  })

  test('mostra o erro do backend quando a exclusão falha, sem fechar o diálogo', async ({
    page,
  }) => {
    await openEmployeesPage(page, {
      onDelete: async (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Você não pode excluir a própria conta.' }),
        }),
    })

    await page
      .getByRole('row', { name: /Maria Fiscal/ })
      .getByRole('button', { name: 'Excluir' })
      .click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sim, excluir' }).click()

    await expect(page.getByText('Você não pode excluir a própria conta.')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
})

test.describe('alternância de tema', () => {
  test('troca entre claro e escuro, e mantém depois de recarregar', async ({ page }) => {
    await page.goto('/')

    const html = page.locator('html')
    const toggle = page.getByRole('switch', { name: /Mudar para tema/ })
    const initialTheme = await html.getAttribute('data-theme')

    await toggle.click()
    const toggledTheme = await html.getAttribute('data-theme')
    expect(toggledTheme).not.toBe(initialTheme)

    await page.reload()
    await expect(html).toHaveAttribute('data-theme', toggledTheme ?? '')
  })
})

test.describe('menu e rotas por cargo', () => {
  test('o Fiscal vê só Capturar e Check-ins liberados; o resto fica bloqueado', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsTestUser(page, employeeWithRole('fiscal'))
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Capturar placa' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Check-ins recentes' })).toBeVisible()
    for (const name of ['Agendamentos', 'Logs', 'Relatórios', 'Funcionários', 'Permissões']) {
      await expect(page.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(page.locator('.nav-locked')).toHaveCount(4)
    await expect(page.getByText('Fiscal de Portaria').first()).toBeVisible()
  })

  test('no celular o Fiscal tem só duas abas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await loginAsTestUser(page, employeeWithRole('fiscal'))
    await page.goto('/')

    await expect(
      page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link'),
    ).toHaveCount(2)
  })

  test('acessar uma tela sem permissão leva à tela principal do cargo', async ({ page }) => {
    await loginAsTestUser(page, employeeWithRole('analista'))
    await page.route('**/api/checkins?*', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/api/logs?*', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.goto('/agendamentos')

    await expect(page).toHaveURL(/\/relatorios$/)
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  })

  test('só o Administrador enxerga o menu e a tela de Permissões', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsTestUser(page, employeeWithRole('supervisor'))
    await page.goto('/permissoes')

    await expect(page.getByRole('heading', { name: 'Permissões por cargo' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Permissões' })).toHaveCount(0)
  })
})

test.describe('cadastro com cargo e tela de permissões', () => {
  test('o administrador escolhe o cargo ao cadastrar e vê o selo na lista', async ({ page }) => {
    await loginAsTestUser(page, employeeWithRole('admin'))
    let sentBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/employees', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 2, username: 'ana', full_name: 'Ana Analista', role: 'analista', active: true },
          ]),
        })
      }
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 3,
          username: 'paulo',
          full_name: 'Paulo Planejador',
          role: 'planejador',
          active: true,
        }),
      })
    })
    await page.goto('/funcionarios')

    await expect(page.getByRole('row', { name: /Ana Analista/ })).toContainText(
      'Analista de Operações',
    )
    await page.getByLabel('Usuário').fill('paulo')
    await page.getByLabel('Nome completo').fill('Paulo Planejador')
    await page.getByLabel('Senha temporária').fill('temp12345')
    await page.getByLabel('Cargo').selectOption('planejador')
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    await expect(page.getByText(/Paulo Planejador.*cadastrado/)).toBeVisible()
    expect(sentBody).toMatchObject({ role: 'planejador', username: 'paulo' })
  })

  test('mostra a matriz de permissões vinda do backend', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsTestUser(page, employeeWithRole('admin'))
    await page.route('**/api/auth/permissions', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          roles: {
            fiscal: PERMISSIONS.fiscal,
            planejador: PERMISSIONS.planejador,
            analista: PERMISSIONS.analista,
            supervisor: PERMISSIONS.supervisor,
            admin: PERMISSIONS.admin,
          },
        }),
      }),
    )
    await page.goto('/')
    await page.getByRole('link', { name: 'Permissões' }).click()

    await expect(page.getByRole('heading', { name: 'Permissões por cargo' })).toBeVisible()
    const fiscal = page.getByRole('row', { name: /Fiscal de Portaria/ })
    await expect(fiscal.getByLabel('Acesso total')).toHaveCount(1)
    await expect(fiscal.getByLabel('Somente leitura')).toHaveCount(1)
    await expect(fiscal.getByLabel('Sem acesso')).toHaveCount(4)
    await expect(
      page.getByRole('row', { name: /Administrador/ }).getByLabel('Acesso total'),
    ).toHaveCount(6)
  })
})
