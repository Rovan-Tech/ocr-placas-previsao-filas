import { expect, test, type Page } from '@playwright/test'
import { PERMISSIONS, employeeWithRole, loginAsTestUser, roleOf, type TestRole } from './testAuth'

const CATALOG = [
  {
    key: 'capture',
    label: 'Capturar placa',
    permissions: [
      {
        key: 'capture.read_plate',
        label: 'Ler a placa (foto ou digitação)',
        description: 'Permite fotografar ou digitar a placa do caminhão.',
      },
      {
        key: 'capture.authorize_entry',
        label: 'Autorizar entrada',
        description: 'Explica: Autorizar entrada.',
      },
      {
        key: 'capture.refuse_entry',
        label: 'Recusar entrada',
        description: 'Explica: Recusar entrada.',
      },
    ],
  },
  {
    key: 'checkins',
    label: 'Check-ins',
    permissions: [
      { key: 'checkins.view', label: 'Ver check-ins', description: 'Explica: Ver check-ins.' },
    ],
  },
  {
    key: 'schedules',
    label: 'Agendamentos',
    permissions: [
      {
        key: 'schedules.view',
        label: 'Ver agendamentos e fotos',
        description: 'Explica: Ver agendamentos e fotos.',
      },
      {
        key: 'schedules.create',
        label: 'Cadastrar agendamento',
        description: 'Explica: Cadastrar agendamento.',
      },
    ],
  },
  {
    key: 'logs',
    label: 'Logs',
    permissions: [
      { key: 'logs.view', label: 'Ver logs e fotos', description: 'Explica: Ver logs e fotos.' },
    ],
  },
  {
    key: 'reports',
    label: 'Relatórios',
    permissions: [
      { key: 'reports.view', label: 'Ver relatórios', description: 'Explica: Ver relatórios.' },
    ],
  },
  {
    key: 'employees',
    label: 'Funcionários',
    permissions: [
      {
        key: 'employees.view',
        label: 'Ver a lista de funcionários',
        description: 'Explica: Ver a lista de funcionários.',
      },
      {
        key: 'employees.create',
        label: 'Cadastrar funcionário',
        description: 'Explica: Cadastrar funcionário.',
      },
      {
        key: 'employees.deactivate',
        label: 'Excluir funcionário',
        description: 'Explica: Excluir funcionário.',
      },
      {
        key: 'employees.set_role',
        label: 'Trocar o cargo de um funcionário',
        description: 'Explica: Trocar o cargo de um funcionário.',
      },
    ],
  },
  {
    key: 'permissions',
    label: 'Permissões',
    permissions: [
      {
        key: 'permissions.manage',
        label: 'Gerenciar cargos e permissões',
        description: 'Explica: Gerenciar cargos e permissões.',
      },
    ],
  },
]

const SYSTEM_ROLES: TestRole[] = ['fiscal', 'planejador', 'analista', 'supervisor', 'admin']

function matrix(extraRoles: unknown[] = []) {
  return {
    catalog: CATALOG,
    roles: [
      ...SYSTEM_ROLES.map((key) => ({ ...roleOf(key), permissions: PERMISSIONS[key] })),
      ...extraRoles,
    ],
  }
}

const ANA = {
  id: 2,
  username: 'ana',
  full_name: 'Ana Analista',
  role: roleOf('analista'),
  permissions: PERMISSIONS.analista,
  overrides: { granted: [], denied: [] },
  active: true,
}

async function mockEmployees(page: Page) {
  await page.route('**/api/auth/employees', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify([ANA]) })
      : route.fallback(),
  )
}

test.describe('funcionários: cargo e exceções', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await loginAsTestUser(page, employeeWithRole('admin'))
    await mockEmployees(page)
  })

  test('cadastra escolhendo o cargo da lista', async ({ page }) => {
    let sentBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/employees', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...ANA, id: 3, username: 'paulo', full_name: 'Paulo Planejador' }),
      })
    })
    await page.goto('/funcionarios')

    await page.getByLabel('Usuário').fill('paulo')
    await page.getByLabel('Nome completo').fill('Paulo Planejador')
    await page.getByLabel('Senha temporária').fill('temp12345')
    await page
      .getByLabel('Cargo', { exact: true })
      .selectOption({ label: 'Planejador de Agendamentos' })
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    await expect(page.getByText(/Paulo Planejador.*cadastrado/)).toBeVisible()
    expect(sentBody).toMatchObject({ username: 'paulo', role_id: 2 })
  })

  test('troca o cargo de um funcionário pela lista', async ({ page }) => {
    let sentBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/employees/2/role', (route) => {
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...ANA, role: roleOf('supervisor') }),
      })
    })
    await page.goto('/funcionarios')

    await page.getByLabel('Cargo de Ana Analista').selectOption({ label: 'Supervisor de Turno' })

    await expect(page.getByLabel('Cargo de Ana Analista')).toHaveValue('4')
    expect(sentBody).toEqual({ role_id: 4 })
  })

  test('mostra o erro quando a troca de cargo é recusada', async ({ page }) => {
    await page.route('**/api/auth/employees/2/role', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Você não pode mudar o próprio cargo.' }),
      }),
    )
    await page.goto('/funcionarios')

    await page.getByLabel('Cargo de Ana Analista').selectOption({ label: 'Supervisor de Turno' })

    await expect(page.getByText('Você não pode mudar o próprio cargo.')).toBeVisible()
  })

  test('libera e bloqueia ações só para uma pessoa', async ({ page }) => {
    let sentBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/permissions', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(matrix()) }),
    )
    await page.route('**/api/auth/employees/2/permissions', (route) => {
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...ANA,
          overrides: { granted: ['schedules.create'], denied: ['logs.view'] },
        }),
      })
    })
    await page.goto('/funcionarios')

    await page.getByRole('button', { name: 'Permissões' }).click()
    const editor = page.getByRole('region', { name: 'Permissões de Ana Analista' })
    await expect(editor.getByLabel('Ver logs e fotos', { exact: true })).toContainText(
      'Seguir o cargo (permite)',
    )
    await expect(editor.getByLabel('Cadastrar agendamento', { exact: true })).toContainText(
      'Seguir o cargo (bloqueia)',
    )
    await editor.getByLabel('Cadastrar agendamento', { exact: true }).selectOption('grant')
    await editor.getByLabel('Ver logs e fotos', { exact: true }).selectOption('deny')
    await editor.getByRole('button', { name: 'Salvar exceções' }).click()

    await expect(editor).toHaveCount(0)
    await expect(page.getByRole('row', { name: /Ana Analista/ })).toContainText('com exceções')
    expect(sentBody).toEqual({ granted: ['schedules.create'], denied: ['logs.view'] })
  })
})

test('sem a permissão de cadastrar, o formulário não aparece', async ({ page }) => {
  const admin = employeeWithRole('admin')
  await loginAsTestUser(page, {
    ...admin,
    permissions: admin.permissions.filter((key) => key !== 'employees.create'),
  })
  await mockEmployees(page)
  await page.goto('/funcionarios')

  await expect(page.getByRole('row', { name: /Ana Analista/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cadastrar novo funcionário' })).toHaveCount(0)
})

test.describe('tela de permissões editável', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAsTestUser(page, employeeWithRole('admin'))
  })

  const LOG_ENTRY = {
    id: 1,
    created_at: '2026-09-30T14:02:00Z',
    actor_username: 'renata.souza',
    actor_name: 'Renata Souza',
    client_ip: '187.54.2.11',
    action: 'role_updated',
    target_name: 'Fiscal de Portaria',
    summary: 'No cargo “Fiscal de Portaria”: liberou Ver logs e fotos',
    details: {},
  }

  async function mockMatrix(page: Page, extraRoles: unknown[] = []) {
    await page.route('**/api/auth/permission-log*', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([LOG_ENTRY]) }),
    )
    await page.route('**/api/auth/permissions', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(matrix(extraRoles)) }),
    )
  }

  test('liga e desliga ações do cargo escolhido e salva só o que mudou', async ({ page }) => {
    const puts: Array<{ url: string; body: Record<string, unknown> }> = []
    await mockMatrix(page)
    await page.route('**/api/auth/roles/*', (route) => {
      puts.push({ url: route.request().url(), body: route.request().postDataJSON() })
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...roleOf('fiscal'), permissions: [] }),
      })
    })
    await page.goto('/permissoes')

    await expect(page.getByRole('tab', { name: 'Fiscal de Portaria' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const logs = page.getByRole('checkbox', { name: 'Ver logs e fotos' })
    await expect(logs).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
    await logs.check()
    await page.getByRole('checkbox', { name: 'Recusar entrada' }).uncheck()
    await expect(page.getByText('2 alterações em 1 cargo, ainda não salvas')).toBeVisible()
    await page.getByRole('button', { name: 'Salvar alterações' }).click()

    await expect(page.getByText('Permissões salvas.')).toBeVisible()
    expect(puts).toHaveLength(1)
    expect(puts[0]?.url).toMatch(/\/roles\/1$/)
    expect(puts[0]?.body).toEqual({
      name: 'Fiscal de Portaria',
      permissions: ['capture.read_plate', 'capture.authorize_entry', 'checkins.view', 'logs.view'],
    })
  })

  test('altera as permissões de outro cargo e salva os dois de uma vez', async ({ page }) => {
    const urls: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    await mockMatrix(page)
    await page.route('**/api/auth/roles/*', (route) => {
      urls.push(route.request().url())
      bodies.push(route.request().postDataJSON())
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...roleOf('fiscal'), permissions: [] }),
      })
    })
    await page.goto('/permissoes')

    await page.getByRole('checkbox', { name: 'Ver logs e fotos' }).check()
    await page.getByRole('tab', { name: 'Analista de Operações' }).click()
    await expect(page.getByRole('checkbox', { name: 'Ver relatórios' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'Ver relatórios' }).uncheck()
    await page.getByRole('checkbox', { name: 'Cadastrar agendamento' }).check()
    await expect(page.getByText('3 alterações em 2 cargos, ainda não salvas')).toBeVisible()
    await page.getByRole('button', { name: 'Salvar alterações' }).click()

    await expect(page.getByText('Permissões salvas.')).toBeVisible()
    expect(urls.map((url) => url.split('/').pop())).toEqual(['1', '3'])
    expect(bodies[1]).toEqual({
      name: 'Analista de Operações',
      permissions: ['checkins.view', 'logs.view', 'schedules.create'],
    })
  })

  test('o aviso de sucesso é um pop-up que some sozinho', async ({ page }) => {
    await mockMatrix(page)
    await page.route('**/api/auth/roles/*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...roleOf('fiscal'), permissions: [] }),
      }),
    )
    await page.goto('/permissoes')

    await page.getByRole('checkbox', { name: 'Ver logs e fotos' }).check()
    await page.getByRole('button', { name: 'Salvar alterações' }).click()

    const toast = page.getByRole('status').filter({ hasText: 'Permissões salvas.' })
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden({ timeout: 8000 })
  })

  test('o aviso de sucesso também fecha pelo botão', async ({ page }) => {
    await mockMatrix(page)
    await page.route('**/api/auth/roles/*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...roleOf('fiscal'), permissions: [] }),
      }),
    )
    await page.goto('/permissoes')

    await page.getByRole('checkbox', { name: 'Ver logs e fotos' }).check()
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await page.getByRole('button', { name: 'Fechar aviso' }).click()

    await expect(page.getByText('Permissões salvas.')).toBeHidden()
  })

  test('mostra o histórico de alterações com quem, IP, hora e o que mudou', async ({ page }) => {
    await mockMatrix(page)
    await page.goto('/permissoes')

    const history = page.getByRole('region', { name: 'Histórico de alterações' })
    const row = history.getByRole('row', { name: /Renata Souza/ })
    await expect(row).toContainText('renata.souza')
    await expect(row).toContainText('187.54.2.11')
    await expect(row).toContainText('liberou Ver logs e fotos')
    await expect(row.getByRole('time')).toBeVisible()
  })

  test('sem alterações registradas, o histórico avisa', async ({ page }) => {
    await mockMatrix(page)
    await page.route('**/api/auth/permission-log*', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.goto('/permissoes')

    await expect(page.getByText('Nenhuma alteração registrada ainda.')).toBeVisible()
  })

  test('o ícone de ajuda explica o que a permissão faz', async ({ page }) => {
    await mockMatrix(page)
    await page.goto('/permissoes')

    const tooltip = page.getByRole('tooltip').filter({ hasText: 'Explica: Ver logs e fotos.' })
    await expect(tooltip).toBeHidden()
    await page.getByRole('button', { name: 'O que faz: Ver logs e fotos' }).hover()

    await expect(tooltip).toBeVisible()
  })

  test('a barra de salvar continua visível mesmo com a página rolada', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 })
    await mockMatrix(page)
    await page.goto('/permissoes')

    await page.getByRole('checkbox', { name: 'Ver logs e fotos' }).check()
    await page
      .getByRole('checkbox', { name: 'Gerenciar cargos e permissões' })
      .scrollIntoViewIfNeeded()

    await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeInViewport()
  })

  test('descartar volta ao que estava salvo', async ({ page }) => {
    await mockMatrix(page)
    await page.goto('/permissoes')

    const logs = page.getByRole('checkbox', { name: 'Ver logs e fotos' })
    await logs.check()
    await page.getByRole('button', { name: 'Descartar' }).click()

    await expect(logs).not.toBeChecked()
    await expect(page.getByText('Nenhuma alteração pendente')).toBeVisible()
  })

  test('cria um cargo novo e ele já vem selecionado', async ({ page }) => {
    let created = false
    let sentBody: Record<string, unknown> | null = null
    const monitor = {
      id: 9,
      key: 'monitor-noturno',
      name: 'Monitor Noturno',
      is_system: false,
      permissions: [],
    }
    await page.route('**/api/auth/permissions', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(matrix(created ? [monitor] : [])),
      }),
    )
    await page.route('**/api/auth/roles', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      created = true
      sentBody = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(monitor),
      })
    })
    await page.goto('/permissoes')

    await page.getByRole('button', { name: 'Novo cargo' }).click()
    await page.getByLabel('Nome do novo cargo').fill('Monitor Noturno')
    await page.getByRole('button', { name: 'Criar cargo' }).click()

    await expect(page.getByRole('tab', { name: 'Monitor Noturno' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('checkbox', { name: 'Ver check-ins' })).not.toBeChecked()
    expect(sentBody).toEqual({ name: 'Monitor Noturno', permissions: [] })
  })

  test('mostra o erro quando o nome do cargo já existe', async ({ page }) => {
    await mockMatrix(page)
    await page.route('**/api/auth/roles', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Já existe um cargo com esse nome.' }),
          })
        : route.fallback(),
    )
    await page.goto('/permissoes')

    await page.getByRole('button', { name: 'Novo cargo' }).click()
    await page.getByLabel('Nome do novo cargo').fill('Fiscal de Portaria')
    await page.getByRole('button', { name: 'Criar cargo' }).click()

    await expect(page.getByText('Já existe um cargo com esse nome.')).toBeVisible()
  })

  test('exclui um cargo criado depois de confirmar; cargos do sistema não têm o botão', async ({
    page,
  }) => {
    let deleted = false
    const temp = { id: 9, key: 'temp', name: 'Temporario', is_system: false, permissions: [] }
    await page.route('**/api/auth/permissions', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(matrix(deleted ? [] : [temp])),
      }),
    )
    await page.route('**/api/auth/roles/9', (route) => {
      deleted = true
      return route.fulfill({ status: 204 })
    })
    await page.goto('/permissoes')

    await expect(page.getByRole('button', { name: /Excluir cargo/ })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Temporario' }).click()
    await page.getByRole('button', { name: 'Excluir cargo Temporario' }).click()
    await page.getByRole('button', { name: 'Sim, excluir' }).click()

    await expect(page.getByText('Cargo "Temporario" excluído.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Temporario' })).toHaveCount(0)
  })

  test('mostra a recusa do backend quando a mudança trancaria o sistema', async ({ page }) => {
    await mockMatrix(page)
    await page.route('**/api/auth/roles/5', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Essa mudança deixaria o sistema sem ninguém que possa gerenciar permissões.',
        }),
      }),
    )
    await page.goto('/permissoes')

    await page.getByRole('tab', { name: 'Administrador' }).click()
    await page.getByRole('checkbox', { name: 'Gerenciar cargos e permissões' }).uncheck()
    await page.getByRole('button', { name: 'Salvar alterações' }).click()

    await expect(page.getByText(/deixaria o sistema sem ninguém/)).toBeVisible()
  })
})
