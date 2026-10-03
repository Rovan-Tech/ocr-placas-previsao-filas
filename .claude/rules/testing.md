---
paths:
  - "backend/tests/**/*.py"
  - "frontend/tests/**/*.{ts,tsx}"
---

# Testes

Regras genéricas de teste. Convenções específicas de OCR (`hard_cases`/`random_cases`,
`MAX_SILENT_ERRORS`, `FakeReader`) estão em [`backend/CLAUDE.md`](../../backend/CLAUDE.md) — não
repetidas aqui.

## pytest (backend)

- Padrão **Arrange-Act-Assert**, um bloco visualmente separado por linha em branco quando ajuda a
  leitura. Nome `test_<unidade>_<cenário>_<resultado>` (ex.:
  `test_estimate_wait_minutes_sem_historico_retorna_none`).
- Fixture compartilhada em `conftest.py`; `@pytest.mark.parametrize` em vez de copiar o mesmo
  teste com um valor trocado — nunca `if`/`for` dentro do corpo do teste decidindo o que
  verificar (isso é sinal de que deveria ser `parametrize`).
- Mock só na fronteira (rede, disco, relógio, EasyOCR, API Brasil) — nunca mockar a própria
  unidade sob teste. Endpoint mocka o service (`@patch("app.routers.<router>.<função>")`,
  patcheando onde é usado); service testa a lógica de verdade.
- Bug corrigido = teste de regressão que falhava antes da correção, no mesmo PR.
- Teste independente de ordem de execução e de estado externo (sem depender de teste anterior ter
  rodado, sem depender de horário do sistema sem congelar o relógio). Markers `unit`, `integration`
  e `e2e` (mais `ocr_real`, já existente) para poder rodar subconjuntos: `pytest -m unit`.

## Vitest (frontend)

- Mesmo padrão Arrange-Act-Assert e `parametrize` via `it.each`. Testa lógica pura de
  `src/services/` (formatação de placa, cálculo de tempo de espera exibido, tratamento de erro da
  API) — chamada HTTP sempre mockada (`vi.fn()`/`vi.mock`), nunca bate na API real.
- Componentes e páginas (`*.test.tsx`, jsdom + Testing Library + `user-event`): consulta por
  papel/rótulo/texto como no Playwright, cobrindo carregando/vazio/erro e cada ramo de permissão.
  Mock só na fronteira: `services/api`/`services/auth`, o `useAuth` quando a página só precisa do
  funcionário logado, e hardware (câmera, canvas). Helpers e fixtures em `tests/unit/support/`.

## Playwright (E2E)

- A suíte sobe e derruba o próprio ambiente via `webServer` do `playwright.config.ts` (já
  configurado) — não depender de o backend já estar rodando manualmente.
- Localizador por papel/rótulo/texto (`getByRole`, `getByLabel`, `getByText`), nunca por classe
  CSS ou seletor frágil (já é a convenção do projeto, ver `CLAUDE.md` raiz).
- Nada de `page.waitForTimeout` fixo — usar `expect(locator).toBeVisible()`/`toHaveText()`, que
  espera sozinho até o timeout do Playwright.
- Falha guarda trace/screenshot/vídeo (`playwright.config.ts` → `use.trace`/`screenshot`/`video`
  em `on-first-retry` ou equivalente) para debug sem precisar reproduzir localmente.
- API pode ser interceptada com `page.route` para não depender do backend real quando o teste é
  sobre o comportamento da tela, não sobre a integração ponta a ponta.

## Cobertura

- Mínimo de 90% nas linhas alteradas (`diff-cover`, parte do `--full` do gate); a cobertura
  global nunca pode cair em relação à baseline registrada em
  [`docs/tech-debt.md`](../../docs/tech-debt.md).
