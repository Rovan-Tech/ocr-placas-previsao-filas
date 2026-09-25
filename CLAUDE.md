# CLAUDE.md

Guia para quem (humano ou Claude Code) for trabalhar neste repositório. Regras específicas do
backend (convenções de router/service, testes de OCR, login/auditoria, contrato com o
frontend) estão em [`backend/CLAUDE.md`](backend/CLAUDE.md) e valem junto com este arquivo.

**Índice**: [O que é este projeto](#o-que-é-este-projeto) ·
[Como o sistema funciona](#como-o-sistema-funciona) · [Stack](#stack) · [Estrutura](#estrutura) ·
[Comandos](#comandos) · [Testes](#testes-são-obrigatórios) ·
[Segurança](#segurança-é-obrigatória) ·
[Boas práticas / qual skill usar](#boas-práticas-de-desenvolvimento) ·
[Deploy](#deploy-produção) · [Antes de abrir PR](#antes-de-abrir-pr) ·
[O que não fazer](#o-que-não-fazer) · [Grafo de conhecimento](#grafo-de-conhecimento-do-projeto-graphify-out) ·
[Skills disponíveis](#skills-disponíveis-claudeskills)

## O que é este projeto

Projeto de portfólio da Rovan: sistema de OCR de placas e previsão de filas para o **Porto
Baía Verde** (nome fictício, criado só para este case de portfólio — não representa o porto
real de Itaqui nem qualquer outro porto existente).

O fiscal na guarita aponta a câmera do celular (ou uma câmera fixa) para a placa do caminhão,
o sistema lê a placa via OCR e faz o check-in automático. Um algoritmo simples estima o tempo
de espera com base no histórico de caminhões já registrados.

É um projeto de demonstração para mostrar no site da Rovan — sem cliente real por trás, mas
construído com qualidade de produção para servir de portfólio técnico.

> **Status atual**: a leitura de placa (OCR) e o login/auditoria de funcionário estão
> **implementados e testados de ponta a ponta**. O check-in automático e a previsão de fila
> ainda **não** — ver [Como o sistema funciona](#como-o-sistema-funciona) para o que existe hoje
> vs. o que é o próximo passo planejado.

## Como o sistema funciona

Fluxo real, arquivo por arquivo e função por função (para o mapa navegável completo, ver
[Grafo de conhecimento](#grafo-de-conhecimento-do-projeto-graphify-out) e, para o detalhe fino de
cada peça do backend, [`backend/CLAUDE.md`](backend/CLAUDE.md)).

1. **Login** — o fiscal loga (`POST /auth/login`, `app/routers/auth.py`) com usuário/senha
   (hash `bcrypt`, `app/services/auth.py`) e recebe um JWT HS256 (`pyjwt`) válido por 12h ("um
   turno"). Todo `Employee` novo nasce com `must_change_password=True`; `get_current_employee`
   bloqueia qualquer endpoint (exceto `/auth/change-password`) até a senha ser trocada, ou depois
   de 30 dias (`PASSWORD_MAX_AGE`). Não existe cadastro aberto — só admin cria funcionário
   (`POST /auth/employees`); o primeiro admin nasce via `backend/scripts/create_employee.py`,
   direto no banco.
2. **Captura da foto** — `frontend/src/components/CameraCapture.tsx` usa `getUserMedia`
   (câmera traseira, `facingMode: 'environment'`) quando disponível; senão cai para
   `<input type=file capture="environment">` (ex.: celular acessando o dev server por IP sem
   HTTPS). A foto é redimensionada no cliente (máx. 1600px, JPEG qualidade 0.85) antes de subir.
3. **Confirmação e envio** — `frontend/src/pages/CapturePage.tsx` deixa o fiscal confirmar que a
   foto está legível antes de gastar uma chamada de OCR, depois chama
   `POST /ocr/upload` (`frontend/src/services/api.ts`).
4. **Validação de upload** — `app/routers/ocr.py` (`upload_plate_image()`): tipo de conteúdo
   (`ALLOWED_CONTENT_TYPES`), tamanho (`MAX_UPLOAD_BYTES` = 5 MB), rate limit por IP
   (`@limiter.limit`, `app/rate_limit.py`, padrão `10/minute`).
5. **Localização da placa (OpenCV)** — `find_plate_candidates()` em
   `app/services/plate_locator.py` combina 3 detectores (moldura da placa, bloco de texto
   escuro, agrupamento de caracteres soltos), endireita cada candidato (`rectify()`, corrige
   rotação/inclinação) e recorta com margem — devolve até 3 recortes + uma variante "larga" do
   melhor (recupera letra cortada na borda).
6. **Variantes de pré-processamento** — `ocr_variants()` em
   `app/services/image_preprocessing.py` gera, sob demanda, versões cada vez mais agressivas:
   clareada → contraste (CLAHE) → sem reflexo → sem arranhões → sem ruído → nitidez.
7. **OCR + votação** — `read_plate()` em `app/services/ocr_service.py` orquestra recortes ×
   variantes através do EasyOCR (`gpu=False`, allowlist `A-Z0-9-`), junta leituras em
   `plate_format.find_plate()` (corrige troca de caractere letra↔número só nas posições onde faz
   sentido) e vota entre os candidatos. Para de tentar cedo (`SOFT_TIME_BUDGET_S`/
   `HARD_TIME_BUDGET_S`) assim que uma leitura fica confiante o bastante.
8. **Decisão de revisão** — a leitura só é aceita sem revisão (`needs_review=False`) se a
   confiança for ≥ `REVIEW_CONFIDENCE` (0.65), não for ambígua (segundo colocado muito próximo)
   **e** tiver vindo de um recorte com evidência estrutural forte (moldura ou bloco de texto —
   evidência fraca sozinha sempre força revisão, mesmo com confiança numérica alta).
9. **Divergência / falha do OCR** — o fiscal pode digitar a placa manualmente
   (`ManualPlateEntry.tsx` → `POST /ocr/manual`), que valida o formato mas nunca reflete o texto
   inválido de volta na mensagem de erro, e persiste a foto como auditoria.
10. **Auditoria** — toda chamada a `/ocr/upload` ou `/ocr/manual` grava um `UploadLog`
    (`_log_upload()`) com funcionário, IP, placa lida pelo OCR, placa manual, placa final,
    `needs_review` e caminho da foto — nunca derruba a resposta principal se o log falhar.
11. **Verificação oficial** — `app/services/plate_verification.py` é o ponto de integração
    com uma base oficial (SENATRAN/Serpro); hoje sempre devolve `NOT_CHECKED` (stub
    documentado, sem provedor real).

**O que ainda não existe** (documentado em detalhe em
[`backend/CLAUDE.md`](backend/CLAUDE.md#próximos-passos-planejados)): o modelo `CheckIn`
existe, está migrado (Alembic) e testado isoladamente, mas **nenhum código cria uma linha
nele** — não há router `/checkins`, e o `GET /checkins` que o frontend já espera
(`CheckinsPage.tsx`, com uma mensagem amigável de "endpoint ainda não existe") devolve 404. A
previsão de fila (média móvel simples sobre check-ins recentes) também é só plano. Se a tarefa
for "implementar check-in" ou "implementar previsão de fila", **isto é greenfield** — não existe
lógica parcial escondida em algum lugar para reaproveitar; comece por
`POST /ocr/upload` criando o `CheckIn` logo após `_log_upload()`, depois um router novo
`app/routers/checkins.py`.

## Stack

- **Backend**: Python + FastAPI, servido com Uvicorn
- **OCR**: EasyOCR (open-source, sem custo de API, `gpu=False`) + OpenCV
  (`opencv-python-headless`) para localizar e recortar a placa antes do OCR. EasyOCR foi
  escolhido no lugar do Tesseract por instalar 100% via pip, sem binário de sistema — ver
  [`backend/CLAUDE.md`](backend/CLAUDE.md) para o porquê.
- **Auth**: `bcrypt` (hash de senha) + `pyjwt` (JWT HS256) — nunca `python-jose` (CVE transitiva
  em `ecdsa`, irrelevante aqui mas evitar mesmo assim).
- **Rate limiting**: `slowapi` (limita `/ocr/upload` por IP).
- **Frontend**: React + TypeScript (Vite), em modo `strict` — código novo é sempre `.ts`/`.tsx`,
  sem `any` implícito; os tipos das respostas da API ficam em `src/services/api.ts`
- **Banco de dados**: PostgreSQL + SQLAlchemy + Alembic (via Docker Compose em desenvolvimento)
- **Testes backend**: pytest + `httpx`/`TestClient`
- **Testes frontend**: Vitest (unitário) + Playwright (e2e)

## Estrutura

```
backend/
  app/
    main.py           cria o FastAPI, registra routers, middlewares de segurança, warmup do EasyOCR
    config.py         Settings (pydantic-settings): banco, JWT, CORS, rate limit
    db.py             Base/engine/SessionLocal/get_db()
    rate_limit.py      limiter do slowapi (módulo próprio, evita import circular com ocr.py)
    routers/           health.py, auth.py, ocr.py, logs.py
                       (não existe checkins.py ainda — ver "Como o sistema funciona")
    services/          plate_locator.py, image_preprocessing.py, plate_format.py, ocr_service.py,
                       plate_verification.py, auth.py, photo_storage.py
    models/            employee.py, upload_log.py, checkin.py (SQLAlchemy)
  migrations/          Alembic (versions/, env.py)
  scripts/             create_employee.py — cria o primeiro admin direto no banco
  tests/               um test_<módulo>.py por router/service, + test_security.py, test_ocr_accuracy.py
  requirements.txt / pyproject.toml
frontend/
  src/
    components/        CameraCapture, Layout, ManualPlateEntry, OcrResult, ThemeToggle
    pages/             CapturePage, LoginPage, ChangePasswordPage, CheckinsPage, LogsPage,
                       CreateEmployeePage
    context/           AuthContext, ThemeContext
    services/          api.ts (chamadas HTTP), auth.ts, authToken.ts, plate.ts
    App.tsx            roteamento (react-router-dom) + guarda de login/troca de senha
  tests/
    unit/              Vitest (api.test.ts, plate.test.ts)
    e2e/               Playwright (auth/capture/checkins/mobile.spec.ts)
scripts/dev.mjs        orquestra tudo: Docker → venv/deps → migração → deps do frontend → Uvicorn+Vite
docker-compose.yml     sobe o PostgreSQL local (porta 5433) e semeia o banco de teste
```

## Comandos

Ambiente inteiro (PostgreSQL + migrações + FastAPI + Vite), na raiz:
```bash
npm run dev           # scripts/dev.mjs — Ctrl+C encerra; --no-open não abre o navegador
```

Backend:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest                                                # testes
bandit -r app -q                                      # análise estática de segurança
pip-audit -r requirements.txt                         # dependências com CVE conhecida
```

Frontend:
```bash
cd frontend
npm install
npm run dev
npm run test          # Vitest
npm run test:e2e      # Playwright (1ª vez: npx playwright install chromium)
npm run build         # tsc -b (checagem de tipos) + vite build
npm audit --audit-level=high
```

Banco:
```bash
docker compose up -d   # sobe o PostgreSQL local
```

## Testes são obrigatórios

Nenhuma funcionalidade é considerada pronta sem teste. Toda mudança nova ou alterada — por
menor que seja — vem acompanhada, **no mesmo PR**, de:

1. **Backend (pytest)**: teste para qualquer lógica de OCR, previsão de fila, modelo ou
   endpoint novo/alterado. Endpoints são testados com `TestClient`, cobrindo o caminho feliz
   **e** os caminhos de erro (entrada inválida, arquivo errado, recurso inexistente). Chamadas
   pesadas (EasyOCR) são mockadas nos testes de rota; a lógica em si é testada isoladamente
   em `services/`.
2. **Frontend — unitário (Vitest)**: teste para toda lógica em `src/services` e para
   funções puras/hooks (formatação de placa, cálculo exibido de tempo de espera, tratamento de
   erro da API). Chamadas HTTP são mockadas.
3. **Frontend — end-to-end (Playwright)**: teste para qualquer mudança visível ou interativa
   (envio de foto, exibição da placa lida, lista de check-ins, estado de erro, loading,
   responsividade mobile). Usar seletores semânticos (`getByRole`, `getByLabel`,
   `getByText`), nunca classes CSS. A API pode ser interceptada com `page.route` para não
   depender do backend real nos e2e.

Ordem de trabalho: escrever/ajustar o teste junto com o código (de preferência antes), rodar,
ver passar. Bug corrigido = teste de regressão que falhava antes da correção. Um PR com testes
quebrados ou faltando não deve ser mergeado — o CI roda tudo em todo push e PR.

## Segurança é obrigatória

Este projeto recebe upload de imagem de usuários e vai expor uma API pública como portfólio,
então segurança é tratada como teste, não como opcional. Toda funcionalidade nova passa por:

1. **Revisão OWASP Top 10** do que foi alterado, com atenção especial a:
   - **Injeção (SQLi e afins)**: acesso ao banco só via SQLAlchemy ORM ou queries com
     parâmetros vinculados — nunca montar SQL com f-string/concatenação. Nada de `eval`,
     `exec`, `pickle` ou `subprocess` com entrada do usuário.
   - **Upload de arquivos**: validar tipo, tamanho (`MAX_UPLOAD_BYTES`) e resolução
     (`MAX_IMAGE_PIXELS`, contra decompression bomb); nunca salvar com o nome enviado pelo
     cliente; nunca refletir header/entrada do cliente sem tratamento na resposta.
   - **XSS**: no React, nunca usar `dangerouslySetInnerHTML` com dado vindo da API.
   - **CORS**: lista explícita de origens permitidas — nunca `allow_origins=["*"]` junto com
     credenciais.
   - **Exposição de dados**: mensagens de erro sem stack trace, caminho de arquivo ou detalhe
     interno; segredos só em `.env` (fora do git).
   - **Negação de serviço**: endpoints pesados (OCR) precisam de limite de tamanho e, antes de
     ir para produção, rate limiting.
2. **Testes de segurança automatizados** em `backend/tests/test_security.py` (e no Playwright,
   quando for do frontend): cada vulnerabilidade encontrada vira um teste que envia o payload
   malicioso e confirma que ele é bloqueado.
3. **Análise estática e de dependências**: `bandit -r app` e `pip-audit` no backend;
   `npm audit --audit-level=high` no frontend.
4. **Pentest da API rodando localmente** antes de abrir PR que mexa em endpoint: rode o skill
   `/security-check`, que executa as ferramentas acima, ataca os endpoints com payloads
   (injeção, upload malicioso, arquivos gigantes, headers forjados, métodos HTTP inesperados)
   e **corrige** o que encontrar, sempre com teste de regressão.

A API já envia headers de segurança em toda resposta (`SECURITY_HEADERS` em `app/main.py`),
CORS restrito à origem do frontend (`FRONTEND_ORIGINS`, nunca `*`) e rate limiting no
`/ocr/upload` (`OCR_UPLOAD_RATE_LIMIT`, via `slowapi`). Pendências conhecidas: CSP no frontend
e subir o uvicorn com `--no-server-header` em produção.

## Boas práticas de desenvolvimento

Regra geral: **antes de codificar, verifique se existe uma skill em
[`.claude/skills/`](#skills-disponíveis-claudeskills) para o tipo de tarefa e use-a** em vez de
improvisar — elas encapsulam checklist, template e armadilhas já conhecidas para aquele tipo de
trabalho. Guia rápido de qual skill puxar para as tarefas mais comuns neste repositório:

| Tarefa | Skill sugerida | Observação |
| --- | --- | --- |
| Endpoint novo/alterado no FastAPI, mudar contrato de resposta | `senior-backend`, `api-design-reviewer` | Atualizar também a tabela "Contrato com o frontend" em `backend/CLAUDE.md` |
| Tela/componente novo em React | `senior-frontend` | Sempre `.tsx` + tipos em `src/services/api.ts`, nunca `any` |
| Acessibilidade de tela nova/alterada | `a11y-audit` | WCAG 2.2 AA — a guarita pode usar em campo, com luz ruim |
| Escrever/ajustar teste unitário (pytest ou Vitest) | `tdd-guide`, `senior-qa` | Teste junto com o código, de preferência antes (ver [Testes](#testes-são-obrigatórios)) |
| Teste e2e (Playwright) | `playwright-pro` (`fix`/`generate`/`pw-review`) | Seletores semânticos, nunca classe CSS |
| Revisão antes de commitar/abrir PR | `code-reviewer`, `adversarial-reviewer` | Além do `/prepare-pr`, que já roda os testes e o `/security-check` |
| Schema novo ou migração Alembic | `database-designer` | Lembrar do `CheckConstraint` de formato de placa e do `NAMING_CONVENTION` em `app/db.py` |
| Mexeu em auth, upload, CORS, rate limit ou qualquer endpoint | `/security-check` (skill do projeto) + `security-pen-testing`/`ai-security` | Obrigatório antes de PR — ver [Segurança](#segurança-é-obrigatória) |
| Dúvida de arquitetura, "que arquivo mexe se eu alterar X" | `/graphify` | Ver [Grafo de conhecimento](#grafo-de-conhecimento-do-projeto-graphify-out) |
| Consertar algo quebrado ponta-a-ponta (ex.: `/checkins` 404) | `focused-fix`, `zero-hallucination-coder` | Bom para o gap de check-in/fila descrito em [Como o sistema funciona](#como-o-sistema-funciona) |
| Débito técnico, over-engineering, código morto | `tech-debt-tracker`, `minimalist` | Este projeto prefere poucas abstrações (ver [O que não fazer](#o-que-não-fazer)) |
| Performance (OCR lento, endpoint lento) | `performance-profiler` | |
| Preparar/abrir PR | `/prepare-pr` (skill do projeto) | Só quando o usuário pedir explicitamente — ver [Antes de abrir PR](#antes-de-abrir-pr) |
| Checar ou disparar deploy | `/deploy-status`, `/redeploy` (skills do projeto) | |

Outras diretrizes de estilo que valem para qualquer tarefa neste repo:

- **Router fino, service testável** (backend): regra de negócio em `app/services/`, recebendo e
  devolvendo tipos simples; o router só valida o request e converte exceção em `HTTPException`.
  Detalhe completo em [`backend/CLAUDE.md`](backend/CLAUDE.md).
- **Mensagens voltadas ao fiscal (erros de validação, textos de tela) em português; nomes de
  código (variáveis, funções, commits) em inglês.**
- **Sem abstração prematura**: três linhas parecidas são melhores que uma abstração cedo demais
  — este projeto é pequeno de propósito (é portfólio, não vira produto com dezenas de squads).
- **Nunca inventar dado**: se uma resposta de API, endpoint ou campo não existir de verdade no
  código (ex.: `GET /checkins` hoje), não trate como se existisse — confirme lendo o código ou
  o grafo antes de assumir.

## Deploy (produção)

O projeto está no ar, publicado automaticamente a cada merge na `main`.

| O quê       | Onde                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Frontend    | Cloudflare Pages — https://ocr-placas.pages.dev                         |
| Backend     | Google Cloud Run — https://ocr-placas-backend-6yjkqvbuoq-rj.a.run.app   |
| Banco       | Neon Postgres (serverless, região São Paulo/`sa-east-1`)                |
| Projeto GCP | `rovan-tech-portfolio` (org `rovantech.com`), serviço `ocr-placas-backend`, região `southamerica-east1` |
| Imagem      | Artifact Registry, repositório `portfolio`                              |

**CI/CD** (`.github/workflows/`):

- `ci.yml` — roda em todo PR e push na `main`: pytest+bandit+pip-audit no backend,
  Vitest+Playwright+lint+build+npm audit no frontend.
- `deploy.yml` — dispara sozinho (via `workflow_run`) só depois que o `ci.yml` passar na
  `main`, nunca publica um merge quebrado. Builda e sobe a imagem no Artifact Registry, roda
  a migração Alembic contra o Neon, faz deploy no Cloud Run (escala a zero — sem custo
  ocioso) e publica o frontend no Cloudflare Pages já apontando pro backend recém-publicado.
  Autenticação com o Google Cloud via Workload Identity Federation (sem chave de service
  account de longa duração). Também aceita `workflow_dispatch` (re-rodar manualmente, sem
  precisar de commit novo) — use o skill `/redeploy`.

**Secrets** (GitHub → Settings → Secrets and variables → Actions, nomes only — nunca committar
os valores): `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`,
`GCP_REGION`, `GCP_ARTIFACT_REPO`, `DATABASE_URL`, `FRONTEND_ORIGINS`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

Use o skill `/deploy-status` para checar rapidamente se o frontend e o backend em produção
estão de pé e se comunicando direito (sem precisar repetir a investigação manual toda vez).

### Armadilhas já resolvidas (não repetir)

- **Acesso público bloqueado silenciosamente**: contas Google Workspace (como
  `rovantech.com`) vêm com a política de organização `iam.allowedPolicyMemberDomains`
  ("Domain Restricted Sharing"), que impede conceder `allUsers`/acesso público — o
  `--allow-unauthenticated` do Cloud Run falha sem erro visível na hora do deploy. Foi
  criada uma exceção **só para o projeto** `rovan-tech-portfolio` (não pra organização
  inteira). Se recriar o serviço do zero e ele voltar a dar 403, é isso.
- **`cloudflare/pages-action` foi descontinuada e removida do GitHub em 2026** — o `deploy.yml`
  já usa a substituta oficial, `cloudflare/wrangler-action@v4` rodando `wrangler pages deploy`.
- **`VITE_API_BASE`, não `VITE_BACKEND_URL`**: `frontend/src/services/api.ts` lê
  `VITE_API_BASE` pra montar toda chamada da API. `VITE_BACKEND_URL` só existe pro proxy do
  `npm run dev` (`vite.config.ts`) — não tem efeito nenhum no build de produção. O `deploy.yml`
  já passa a variável certa; se recriar o build manualmente, não confundir os dois nomes.
- **EasyOCR puxa PyTorch com CUDA por padrão** (~5 GB de suporte a GPU que este projeto nunca
  usa, `gpu=False`). O `Dockerfile` e o `ci.yml` já instalam `torch`/`torchvision` da versão
  CPU-only (`--index-url https://download.pytorch.org/whl/cpu`) antes do resto do
  `requirements.txt` — sem isso a imagem fica ~3,5x maior e o CI mais lento à toa.

## Antes de abrir PR

**Só abra PR (ou dê push visando abrir um) quando o usuário pedir explicitamente.** Ao terminar
uma tarefa, pare, avise o que mudou e como testar, e espere o usuário testar e mandar abrir o PR.

A `main` é protegida: só aceita mudanças via PR, com CI passando (lint, testes de backend e
frontend, build). Rode o skill `/prepare-pr`: ele sincroniza a branch com a `main`, roda
`/security-check`, os testes do backend (`pytest`) e do frontend (Vitest, Playwright, build),
corrige o que falhar e abre o PR — ver `.claude/skills/prepare-pr/SKILL.md`.

### PR de outra pessoa com CI falhando

Quando o CI falhar num PR aberto por outro colaborador (ex: Leandro), **não corrija o código
dela/dele** — comente no PR (`gh pr comment <número>`) detalhando exatamente onde falhou: qual
teste, o valor esperado vs o obtido, e um resumo do padrão do erro (ex: "maioria dos casos
devolveu `None`" ou "confundiu os caracteres X↔Y"). O autor corrige e sobe novos commits na
mesma branch — o CI roda de novo sozinho, não precisa de PR novo.

## Grafo de conhecimento do projeto (`graphify-out/`)

Gerado pela skill `/graphify` (instalada globalmente em `~/.claude/skills/graphify/SKILL.md`),
que transforma o código deste repositório num grafo de conhecimento navegável — nós (arquivos,
funções, classes, componentes), arestas (chamadas, imports, dependências) e comunidades
(clusters de arquivos que trabalham juntos, ex: "OCR Service & Tests", "Plate Locator
Algorithm", "Auth Tokens & Security Tests").

- **`graph.html`** — visualização interativa (abrir no navegador) para explorar nós e conexões.
- **`graph.json`** — o grafo bruto (nós/arestas/comunidades) em formato estruturado.
- **`GRAPH_REPORT.md`** — resumo legível: hubs de comunidade (áreas do sistema) e "god nodes"
  (funções/classes mais conectadas — hoje `read_plate()`, `_token_for()`, `ocr_variants()`,
  `PlateFormat`, etc.), útil para entender rápido onde uma mudança vai se propagar.
- **`manifest.json`**, **`cost.json`**, **`cache/`**, `.graphify_*` — estado interno/cache do
  graphify para reprocessamento incremental; não editar manualmente.

**Quando usar**: qualquer pergunta sobre arquitetura deste repo, relação entre arquivos, "onde
mexe se eu alterar X", ou navegação em código pouco familiar deve ser tratada primeiro como uma
consulta ao graphify (skill `graphify`, que já dispara automaticamente para esse tipo de
pergunta quando `graphify-out/` existe) em vez de sair grepando o repo do zero. O grafo fica
desatualizado conforme o código muda — regerar com `/graphify` depois de mudanças estruturais
grandes (novo router, novo serviço, refactor de módulos).

## Skills disponíveis (`.claude/skills/`)

Além das skills próprias deste projeto (`deploy-status`, `prepare-pr`, `redeploy`,
`security-check` — ver seções acima), `.claude/skills/` também tem ~380 skills importadas do
repositório comunitário [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills),
organizadas em subpastas por categoria. **Antes de começar qualquer tarefa, verifique se existe
uma skill relevante nessa lista e use-a (via slash command ou invocando a skill) em vez de
improvisar do zero** — elas já encapsulam checklists, templates e boas práticas testadas para
cada tipo de trabalho (design de API, revisão de segurança, testes, growth, compliance, etc.).
A descrição completa de cada skill está no respectivo `SKILL.md`; abaixo vai um resumo por
categoria.

### agent-launcher (6 skills)
- **agent-launcher-orchestrator**: Use when a user wants to build, launch, grade, or schedule a Claude Managed Agent (CMA) in their own Anthropic account.
- **grade-iterate**: Phase 3 of building a Claude Managed Agent — the bounded grade→iterate loop.
- **interview**: Phase 1 of building a Claude Managed Agent — interview the founder about the one job the agent should do.
- **run-without-you**: Phase 4 of building a Claude Managed Agent — make it run without you.
- **stage-launch**: Phase 2 of building a Claude Managed Agent — turn a validated build sheet into exact API payloads and a launch script.
- **wrap-up**: Close out a launched Claude Managed Agent — recap primitives and suggest next upgrades.

### business-growth (5 skills)
- **business-growth-skills**: Router/index para as 4 skills de crescimento (customer-success-manager, sales-engineer, revenue-operations, contract-and-proposal-writer).
- **contract-and-proposal-writer**: Gera contratos, propostas, SOWs, NDAs e MSAs profissionais e sensíveis à jurisdição.
- **customer-success-manager**: Monitora saúde do cliente, prevê churn e identifica oportunidades de expansão (SaaS).
- **revenue-operations**: Analisa saúde do pipeline de vendas, precisão de forecast e eficiência de GTM.
- **sales-engineer**: Analisa RFP/RFI, monta matrizes competitivas e planeja PoCs para pré-vendas.

### business-operations (7 skills)
- **business-operations-skills**: Índice para operações internas — processos, SLAs de fornecedor, capacity planning, comunicação interna.
- **capacity-planner**: Dimensiona capacidade operacional (Erlang-C, FTE ajustado a shrinkage, plano de contratação trimestral).
- **internal-comms**: Redige e sequencia comunicação interna de change-management (reorg, layoff, aquisição, etc.).
- **knowledge-ops**: Cria/valida SOPs e runbooks internos, checagem 5W2H, higiene de wiki (Notion/Confluence).
- **process-mapper**: Documenta processos ponta-a-ponta em notação BPMN e mede tempos de ciclo por etapa.
- **procurement-optimizer**: Auditoria de gastos SaaS, categorização UNSPSC, consolidação de fornecedores.
- **vendor-management**: Scorecard de fornecedores, compliance de SLA, classificação de risco de terceiros.

### c-level-advisor (40 skills)
- **agent-protocol**: Protocolo de comunicação entre agentes para times C-level.
- **arquiteto-de-empresa**: Constrói uma empresa do zero como bundle OKF (árvore de `.md` versionável).
- **board-deck-builder**: Monta decks de board/investidor combinando perspectivas de todo o C-suite.
- **board-meeting**: Protocolo multi-agente de reunião de board para decisões estratégicas.
- **board-prep**: Preparação de board meeting para o cenário adversarial, não o amigável.
- **c-level-skills**: Índice/router do bundle de 33 skills de C-level.
- **ceo-advisor**: Orientação de liderança executiva para decisões estratégicas.
- **cfo-advisor**: Liderança financeira para startups e empresas em crescimento.
- **challenge**: Análise de pré-mortem de um plano.
- **change-management**: Framework para rollout de mudanças organizacionais sem caos.
- **chief-ai-officer-advisor**: Assessoria de Chief AI Officer (build-vs-buy de modelo, risco EU AI Act, custo de IA).
- **chief-customer-officer-advisor**: Assessoria de Chief Customer Officer (retenção, segmentação, dimensionamento de CS).
- **chief-data-officer-advisor**: Assessoria de Chief Data Officer (direitos de dados de treino, estratégia de data product).
- **chief-of-staff**: Camada de orquestração do C-suite.
- **chro-advisor**: Liderança de pessoas para empresas em escala.
- **ciso-advisor**: Liderança de segurança para empresas em crescimento.
- **cmo-advisor**: Liderança de marketing para empresas em escala.
- **company-os**: Meta-framework de como a empresa roda — tecido conectivo entre os papéis C-level.
- **competitive-intel**: Rastreamento sistemático de concorrentes que alimenta CMO/CRO/CPO.
- **context-engine**: Carrega e gerencia contexto da empresa para todas as skills de C-level.
- **coo-advisor**: Liderança de operações para empresas em escala.
- **cpo-advisor**: Liderança de produto para empresas em escala.
- **cro-advisor**: Liderança de receita para empresas B2B SaaS.
- **cs-onboard**: Entrevista de onboarding do fundador capturando contexto da empresa em 7 dimensões.
- **cto-advisor**: Liderança técnica para times de engenharia e decisões de arquitetura.
- **culture-architect**: Constrói, mede e evolui cultura de empresa como comportamento operacional.
- **decision-logger**: Arquitetura de memória em duas camadas para decisões de board.
- **executive-mentor**: Parceiro de pensamento adversarial para fundadores e executivos.
- **founder-coach**: Desenvolvimento de liderança pessoal para fundadores e CEOs de primeira viagem.
- **general-counsel-advisor**: Assessoria jurídica (revisão de contrato, estratégia de IP, term sheets).
- **hard-call**: Framework para decisões sem boas opções.
- **internal-narrative**: Constrói uma narrativa coerente da empresa para todas as audiências.
- **intl-expansion**: Estratégia de expansão internacional de mercado.
- **ma-playbook**: Estratégia de M&A (adquirir ou ser adquirido).
- **org-health-diagnostic**: Checagem de saúde organizacional combinando sinais de todo o C-suite.
- **postmortem**: Análise honesta do que deu errado.
- **scenario-war-room**: Modelagem cruzada de cenários "e se" multi-variável.
- **strategic-alignment**: Cascateia estratégia do board até o colaborador individual.
- **stress-test**: Teste de estresse de premissas de negócio.
- **vpe-advisor**: Assessoria de VP de Engenharia (DORA, funil de contratação, estrutura de time).

### c-level-agents (22 skills)
- **boardroom**: `/cs:boardroom` — deliberação multi-papel de 6 fases pelo C-suite.
- **brief**: `/cs:brief` — gera um brief de estratégia de uma página.
- **c-level-agents**: Time executivo em modo fundador.
- **caio-review**: `/cs:caio-review` — interrogatório de Chief AI Officer sobre planos que envolvem IA.
- **cco-review**: `/cs:cco-review` — interrogatório de Chief Customer Officer sobre retenção/CS.
- **cdo-review**: `/cs:cdo-review` — interrogatório de Chief Data Officer sobre dados/arquitetura de dados.
- **cfo-review**: `/cs:cfo-review` — interrogatório cético sobre qualquer plano que envolva dinheiro.
- **ciso-review**: `/cs:ciso-review` — interrogatório de segurança sobre dados/compliance/acesso.
- **cmo-review**: `/cs:cmo-review` — interrogatório de posicionamento/ICP/canais.
- **cpo-review**: `/cs:cpo-review` — interrogatório de roadmap/PMF/portfólio.
- **cro-review**: `/cs:cro-review` — interrogatório de pipeline/win rate/NRR.
- **cross-eval**: `/cs:cross-eval` — consenso multi-modelo sobre um memo de board.
- **cto-review**: `/cs:cto-review` — interrogatório de arquitetura e escalabilidade.
- **decide**: `/cs:decide` — registra uma decisão na memória de duas camadas.
- **execute**: `/cs:execute` — gera plano de execução de 90 dias com marcos semanais.
- **founder-mode**: `/cs:founder-mode` — roteia a pergunta do fundador para o advisor certo.
- **freeze**: `/cs:freeze` — trava uma decisão estratégica por um período de resfriamento.
- **gc-review**: `/cs:gc-review` — interrogatório jurídico de contratos/IP/regulatório.
- **office-hours**: `/cs:office-hours` — interrogatório estilo YC antes de qualquer conselho.
- **onboard**: `/cs:onboard` — entrevista de fundador que popula o contexto da empresa.
- **post-mortem**: `/cs:post-mortem` — retrospectiva honesta de uma decisão executada.
- **vpe-review**: `/cs:vpe-review` — interrogatório de VP de Engenharia sobre entrega/contratação.

### commercial (8 skills)
- **channel-economics**: Revisão/rebalanceamento de canais diretos vs. parceiros.
- **commercial-forecaster**: Forecast trimestral de bookings/ARR/pipeline/NRR para o board.
- **commercial-policy**: Desenho de política comercial — regras de desconto, alçadas, exceções.
- **commercial-skills**: Índice para revisão/aprovação/desenho de motion comercial.
- **deal-desk**: Revisão de deal específico antes do fechamento (desconto, redline de MSA, margem).
- **partnerships-architect**: Decide se/como fechar parceria (tier, GTM conjunto, revshare).
- **pricing-strategist**: Desenho de modelo de precificação, Van Westendorp, pacotes Good/Better/Best.
- **rfp-responder**: Resposta estruturada a RFP/RFI/RFQ/questionário de segurança.

### compliance-os (9 skills)
- **ai-act-readiness**: `/cs:ai-act-readiness` — interrogatório de prontidão para o EU AI Act.
- **aims-audit**: `/cs:aims-audit` — interrogatório de auditoria interna ISO/IEC 42001 AIMS.
- **compliance-os**: Meta-orquestrador — configura frameworks aplicáveis, computa sobreposição de controles, simula auditorias.
- **compliance-readiness**: `/cs:compliance-readiness` — interrogatório multi-framework de programa de compliance.
- **fda-qsr-audit-prep**: `/cs:fda-qsr-audit-prep` — interrogatório de auditoria FDA 21 CFR 820 (QSR/QMSR).
- **gdpr-audit-prep**: `/cs:gdpr-audit-prep` — interrogatório de auditoria GDPR citando artigos.
- **iso13485-audit-prep**: `/cs:iso13485-audit-prep` — interrogatório de auditoria ISO 13485 QMS.
- **iso27001-audit-prep**: `/cs:iso27001-audit-prep` — interrogatório de prontidão ISO 27001 ISMS.
- **soc2-audit-prep**: `/cs:soc2-audit-prep` — interrogatório de prontidão SOC 2 Type II.

### engineering (89 skills)
- **agent-designer**: Desenho de sistema multi-agente, padrão de orquestração, schemas de tool, análise de logs de execução.
- **agent-harness**: Transforma uma pasta de skills num loop agêntico limitado (plano verificável, execução, verificação, retry, escalonamento humano).
- **agent-memory**: Aprendizado de fatos duráveis a partir das próprias sessões quando o CLAUDE.md cresceu demais.
- **agent-workflow-designer**: Desenho de workflows multi-agente com contratos de handoff e controle de custo/contexto.
- **agenthub**: Plugin de colaboração multi-agente — N subagentes competindo via git worktree.
- **api-design-reviewer**: Revisão de design de API REST com lint automatizado e detecção de breaking change.
- **api-test-suite-builder**: Geração de testes de API, suítes de integração, testes de contrato.
- **ar-resume** / **ar-status** / **autoresearch-agent** / **loop** / **run** / **setup**: Loop de experimento autônomo que otimiza um arquivo por uma métrica mensurável (retomar, ver dashboard, rodar iteração, configurar).
- **behuman**: Respostas de IA mais humanas — menos robóticas, menos em lista.
- **board** / **hub-init** / **hub-status** / **spawn** / **merge** / **eval**: Ferramentas do AgentHub — mensagens entre agentes, criar sessão, ver estado, lançar/mesclar/avaliar subagentes paralelos em worktrees.
- **book-to-skill**: Converte livros/documentação em skills estruturadas (SKILL.md + capítulos + glossário).
- **boost-asio-pro**: Código C++ assíncrono com Boost.Asio/Asio (TCP/UDP, SSL/TLS, coroutines).
- **browser-automation**: Automação de navegador, scraping, preenchimento de formulários, extração de dados.
- **caveman**: Modo de comunicação ultra-comprimido.
- **changelog-generator**: Release notes a partir de Conventional Commits.
- **chaos-engineering**: Planejamento/execução de experimentos de chaos engineering.
- **ci-cd-pipeline-builder**: Geração de pipelines CI/CD a partir do stack detectado do projeto.
- **claude-coach**: Coach pessoal para virar power user do Claude.
- **code-tour**: Cria tours de código (.tour) passo-a-passo com links para arquivos/linhas reais.
- **codebase-onboarding**: Gera documentação de onboarding para engenheiros/contratados a partir do código.
- **collab-proof**: Mede o que o Claude contribuiu vs o que o humano conduziu numa sessão.
- **data-quality-auditor**: Auditoria de completude/consistência/acurácia/validade de dataset.
- **database-designer** / **database-schema-designer**: Desenho de schema de banco, ERDs, normalização, escolha SQL/NoSQL.
- **deep-learning-book**: Base de conhecimento do livro Deep Learning (Goodfellow/Bengio/Courville).
- **demo-video**: Criação de vídeo demo/walkthrough a partir de screenshots ou roteiro.
- **dependency-auditor**: Auditoria e gestão de dependências multi-linguagem.
- **docker-development**: Otimização de Dockerfile, orquestração docker-compose, multi-stage builds, hardening.
- **engineering-advanced-skills**: Índice de 37 skills avançadas de engenharia.
- **env-secrets-manager**: Higiene de variáveis de ambiente e segredos em dev/produção.
- **feature-flags-architect**: Adicionar, aposentar ou auditar feature flags.
- **focused-fix**: Corrigir/debugar uma feature/módulo específico ponta-a-ponta.
- **full-page-screenshot**: Captura de screenshot de página inteira.
- **git-worktree-manager**: Trabalho paralelo seguro com Git worktrees.
- **grill-me** / **grill-with-docs**: Entrevista adversarial de um plano até entendimento compartilhado (a segunda ancorada em CONTEXT.md/ADRs).
- **handoff**: Compacta a conversa atual num documento de handoff para outro agente.
- **helm-chart-builder**: Scaffolding e hardening de Helm charts.
- **hivemind**: Orquestra workers opencode gratuitos a partir do Claude Code para reduzir custo de token.
- **human-gate**: Lane de verificação humana de um loop de agente — prova que a revisão aconteceu.
- **interview-system-designer**: Desenho de processos de entrevista, pipelines de contratação, rubricas de score.
- **karpathy-coder**: Aplica os 4 princípios de código do Karpathy (assunções explícitas, simplicidade, mudanças cirúrgicas, metas verificáveis).
- **kubernetes-operator**: Construção de Kubernetes Operators (controllers que reconciliam CRDs).
- **llm-cost-optimizer**: Otimização proativa de custo de API de LLM.
- **llm-wiki**: Segundo cérebro no Obsidian mantido incrementalmente por um LLM.
- **mcp-server-builder**: Geração de servidores MCP a partir de contratos OpenAPI.
- **memory-engineering**: Desenho/auditoria de sistema de memória de agente (long-context/RAG/graph/agentic).
- **migration-architect**: Planejamento de migração zero-downtime, validação de compatibilidade, rollback.
- **minimalist**: Código eficiente, sem over-engineering, menos dependências, menos abstração.
- **monorepo-navigator**: Navegação e otimização de monorepos.
- **observability-designer**: Estratégia de observabilidade (métricas, logs, traces).
- **performance-profiler**: Profiling sistemático de performance (Node.js, Python, Go).
- **pr-review-expert**: Revisão de PR, análise de mudanças, segurança e qualidade do diff.
- **prompt-governance**: Versionamento, A/B test e registro de prompts em produção.
- **rag-architect**: Desenho de pipeline RAG (chunking, embeddings, vector DB, métricas de retrieval).
- **runbook-generator**: Geração de runbooks operacionais (deploy, incidente, manutenção, rollback).
- **sample-text-processor**: Skill de referência (fixture do skill-tester).
- **secrets-vault-manager**: Setup de gestão de segredos (Vault, AWS/Azure/GCP secret stores), rotação.
- **security-guidance**: Hook PreToolUse contra anti-padrões de segurança.
- **self-eval**: Avaliação honesta de qualidade de trabalho de IA (score de dois eixos).
- **ship-gate**: Auditoria pré-produção que varre o código por segurança, banco de dados, etc.
- **skill-doctor**: Nota o setup de agente a partir do histórico real de conversas; sugere edições de skill.
- **skill-security-auditor**: Auditoria de segurança/vulnerabilidade de skills de agente antes de instalar.
- **skill-tester**: Valida, testa e pontua a qualidade de skills no ecossistema claude-skills.
- **skillopt-sleep**: Ciclo noturno de auto-melhoria consolidando memória/skills do agente.
- **slo-architect**: Definição/revisão/operação de SLOs/SLIs/error budgets.
- **spec-driven-workflow**: Specs antes do código, critérios de aceite, testes gerados da spec.
- **spinning-up-deep-rl**: Base de conhecimento do "Spinning Up in Deep RL" (OpenAI).
- **sql-database-assistant**: Escrita de SQL, otimização, migrações, exploração de schema, ORMs.
- **statistical-analyst**: Testes de hipótese, análise de A/B test, tamanho de amostra, significância.
- **strict-api**: Sem alucinação de API — verificação de que funções/imports existem de verdade.
- **tc-tracker**: Rastreamento de mudanças técnicas e handoff entre sessões de IA.
- **tech-debt-tracker**: Varredura de débito técnico, score de severidade, plano de remediação.
- **terraform-patterns**: Padrões de infraestrutura como código em Terraform.
- **universal-scraping-architect**: Scraping web, crawling, extração de documento, pipelines de dados validados.
- **workflow-builder**: Escrita de scripts de workflow multi-agente determinísticos para a tool Workflow.
- **write-a-skill**: Criação de novas skills com estrutura própria e progressive disclosure.
- **zero-hallucination-coder**: Loop Discuss→Map→Decompose→Execute→Verify que ancora código em estrutura verificada.

### engineering-team (53 skills)
- **a11y-audit**: Auditoria de acessibilidade WCAG 2.2 A/AA (React, Next.js, Vue, Angular, Svelte, HTML).
- **adversarial-reviewer** / **named-persona-adversarial-review**: Revisão de código adversarial que quebra o monólogo de auto-revisão (a segunda com a lente de engenheiros reais: Torvalds, Carmack, Kent Beck...).
- **ai-security**: Avaliação de sistemas de IA/ML contra prompt injection, jailbreak, model inversion.
- **aws-solution-architect** / **azure-cloud-architect** / **gcp-cloud-architect**: Desenho de arquitetura AWS/Azure/GCP para startups e enterprise.
- **browserstack**: Rodar testes no BrowserStack.
- **cloud-security**: Avaliação de infraestrutura cloud contra misconfig, IAM, exposição S3.
- **code-reviewer**: Revisão de código automatizada multi-linguagem (TS, Python, Go, Java, C++, Rust, etc.).
- **coverage**: Análise de gaps de cobertura de teste.
- **email-template-builder**: Sistema de e-mail transacional completo (React Email, Resend/Postmark/SendGrid/SES).
- **embedded-iot-mentor**: Mentor para projetos de hardware embarcado/IoT.
- **engineering-skills**: Índice do bundle de skills de engenharia.
- **epic-design**: Sites 2.5D imersivos e cinematográficos com scroll storytelling.
- **extract**: Transforma um padrão/solução de debug comprovado numa skill reutilizável.
- **fix** / **generate** / **migrate** / **pw-init** / **pw-review** / **report** / **playwright-pro**: Toolkit Playwright (corrigir testes flaky, gerar testes, migrar do Cypress/Selenium, setup, revisão de qualidade, relatório).
- **google-workspace-cli**: Administração do Google Workspace via CLI `gws`.
- **incident-commander** / **incident-response**: Framework de resposta a incidente (detecção→resolução→postmortem) e classificação/triagem de incidente de segurança.
- **memory-review** / **memory-status** / **promote** / **remember** / **self-improving-agent**: Gestão de auto-memória do Claude Code (analisar, dashboard de saúde, promover para CLAUDE.md, salvar explicitamente, curar).
- **ms365-tenant-manager**: Administração de tenant Microsoft 365.
- **red-team**: Engajamentos de red team autorizados, análise de caminho de ataque.
- **security-pen-testing**: Auditorias de segurança, pentest, OWASP Top 10.
- **senior-architect**: Desenho de arquitetura de sistema, microserviços vs monolito, escolha de banco.
- **senior-backend**: APIs REST, microserviços, autenticação, hardening de segurança.
- **senior-computer-vision**: Visão computacional — detecção de objeto, segmentação de imagem.
- **senior-data-engineer**: Pipelines de dados, ETL/ELT, infraestrutura de dados.
- **senior-data-scientist**: Modelagem estatística, desenho de experimento, inferência causal.
- **senior-devops**: CI/CD, automação de infra, containerização, AWS/GCP/Azure.
- **senior-frontend**: React, Next.js, TypeScript, Tailwind CSS.
- **senior-fullstack**: Scaffolding Next.js/FastAPI/MERN/Django, análise de qualidade de código.
- **senior-ml-engineer**: Produtização de modelos, MLOps, integração de LLMs.
- **senior-prompt-engineer**: Otimização de prompt, templates, avaliação de saída de LLM, qualidade de retrieval RAG.
- **senior-qa**: Testes unitários, integração e E2E para React/Next.js.
- **senior-secops** / **senior-security**: Segurança de aplicação, gestão de vulnerabilidade, STRIDE/DREAD, scan de segredo.
- **snowflake-development**: SQL Snowflake, Dynamic Tables, Streams/Tasks, Cortex AI, Snowpark.
- **stripe-integration-expert**: Integrações Stripe (assinatura, pagamento único, billing por uso, webhooks).
- **tdd-guide**: TDD — testes unitários, fixtures/mocks, gaps de cobertura, red-green-refactor.
- **tech-stack-evaluator**: Avaliação/comparação de stack tecnológico com TCO.
- **testrail**: Sincronização de testes com o TestRail.
- **threat-detection**: Caça a ameaças, análise de IOCs, anomalias comportamentais.

### finance (5 skills)
- **business-investment-advisor**: Análise de investimento de negócio e alocação de capital.
- **finance-skills**: Router para financial-analyst e saas-metrics-coach.
- **financial-analyst**: Análise de índice financeiro, valuation DCF, variância de orçamento, forecast contínuo.
- **saas-metrics-coach**: Saúde financeira de SaaS (ARR/MRR, churn, CAC/LTV, NRR).
- **stock-analysis**: Análise fundamentalista multi-fator de empresa de capital aberto (Índia/global).

### loop-library (1 skill)
- **loop-library**: Descobre, compara, audita e desenha loops repetíveis de agente de IA.

### markdown-html (5 skills)
- **design-system**: Captura identidade de marca (cores, fontes, estilo) para os conversores markdown-html.
- **markdown-html-orchestrator**: Converte markdown do projeto num HTML single-file levemente interativo.
- **md-document**: Converte markdown longo (specs, RFCs, relatórios) em HTML com TOC fixo e busca.
- **md-review**: Converte review markdown com diffs/severidade em HTML de 2 colunas.
- **md-slides**: Converte deck markdown em apresentação HTML.

### marketing (7 skills)
- **landing**: Landing page HTML premium com animações 3D CSS/GSAP.
- **linkedin-analytics**: Entende métricas do próprio LinkedIn (o que funcionou, por que o alcance caiu).
- **linkedin-content**: Escreve/edita/revisa post do LinkedIn (história, how-to, carrossel, enquete).
- **linkedin-engagement**: Cresce alcance via comentário, resposta, grupo, outreach no LinkedIn.
- **linkedin-profile**: Audita/reescreve perfil do LinkedIn (headline, sobre, experiência).
- **linkedin-skills**: Índice para crescimento orgânico de presença no LinkedIn.
- **linkedin-strategy**: Plano de LinkedIn (pilares de conteúdo, cadência, posicionamento).

### marketing-skill (49 skills)
- **ab-test-setup**: Planejar/desenhar/implementar teste A/B.
- **ad-creative**: Gerar/iterar criativos de anúncio pago.
- **aeo**: Answer Engine Optimization — otimizar conteúdo para ser citado por LLMs.
- **analytics-tracking**: Setup/auditoria de tracking (GA4, GTM, taxonomia de evento).
- **app-store-optimization**: ASO — keywords, ranking de concorrente, metadata de app.
- **brand-guidelines**: Aplicar/documentar/reforçar guidelines de marca.
- **business-name-fit**: Sugerir/validar nome de empresa/produto culturalmente coerente.
- **campaign-analytics**: Performance de campanha com atribuição multi-touch e ROI.
- **churn-prevention**: Reduzir churn (cancel flow, save offer, pesquisa de saída, dunning).
- **cold-email**: Escrever/melhorar sequência de cold e-mail B2B.
- **competitor-alternatives**: Páginas de comparação/alternativa de concorrente para SEO.
- **content-creator**: Redirecionamento para o especialista correto (skill legada).
- **content-humanizer**: Faz conteúdo gerado por IA soar genuinamente humano.
- **content-production**: Pipeline completo de produção de conteúdo (ideia → publicado).
- **content-strategy**: Planejar estratégia de conteúdo e temas.
- **copy-editing** / **copywriting**: Editar/revisar ou escrever/reescrever copy de marketing.
- **email-sequence**: Criar/otimizar sequência de e-mail/drip/lifecycle.
- **form-cro**: Otimizar formulário (lead, contato, demo, aplicação) que não seja signup.
- **free-tool-strategy**: Construir ferramenta gratuita para geração de lead/SEO/marca.
- **launch-strategy**: Planejar lançamento de produto/feature.
- **local-seo-manager**: SEO local para negócios com área de atendimento.
- **marketing-context**: Cria/mantém o documento de contexto que outras skills de marketing leem.
- **marketing-demand-acquisition**: Campanhas de geração de demanda, ads pagos, SEO, parcerias.
- **marketing-ideas**: Ideias/inspiração de marketing para SaaS.
- **marketing-ops**: Router central do ecossistema de skills de marketing.
- **marketing-psychology**: Aplica princípios psicológicos/behavioral science ao marketing.
- **marketing-skills**: Diretório/router da biblioteca de skills de marketing.
- **marketing-strategy-pmm**: Posicionamento, GTM, inteligência competitiva, lançamento de produto.
- **onboarding-cro**: Otimizar onboarding pós-signup, ativação, time-to-value.
- **page-cro**: Otimizar conversão de página de marketing (home, pricing, feature).
- **paid-ads**: Campanhas de ads pagos (Google, Meta, LinkedIn, X).
- **paywall-upgrade-cro**: Otimizar paywall/upgrade/upsell in-app.
- **popup-cro**: Otimizar popup/modal/overlay/banner de conversão.
- **pricing-strategy**: Desenho/otimização de precificação SaaS.
- **programmatic-seo**: Páginas SEO em escala via template + dados.
- **prompt-engineer-toolkit**: Prompts de marketing testados/versionados (A/B, templates, governança).
- **referral-program**: Desenhar/lançar/otimizar programa de indicação/afiliado.
- **schema-markup**: Implementar/auditar dados estruturados (schema.org) no site.
- **seo-audit**: Auditar/diagnosticar problemas de SEO no site.
- **signup-flow-cro**: Otimizar signup/registro/ativação de trial.
- **site-architecture**: Auditar/redesenhar estrutura de URL/navegação/link interno do site.
- **social-content** / **social-media-analyzer** / **social-media-manager**: Criar/agendar/otimizar conteúdo social, analisar performance, estratégia de rede social.
- **video-content-strategist**: Estratégia de vídeo, roteiro, otimização de YouTube/Reels/TikTok.
- **webinar-marketing**: Planejar/promover/rodar webinar ou evento virtual.
- **x-twitter-growth**: Crescimento de audiência e engajamento no X/Twitter.
- **youtube-full**: Transcrição, busca, navegação de canal/playlist do YouTube.

### product-team (17 skills)
- **agile-product-owner**: Product ownership ágil — backlog e execução de sprint.
- **apple-hig-expert**: Audita/desenha interfaces iOS/macOS/watchOS/visionOS contra a Apple HIG.
- **code-to-prd**: Engenharia reversa de um codebase para um PRD completo.
- **competitive-teardown**: Analisa concorrentes (pricing, reviews, vagas, SEO, redes sociais).
- **experiment-designer**: Planeja experimento de produto, hipótese testável, tamanho de amostra.
- **landing-page-generator**: Gera landing page em Next.js/React/Tailwind pronta para produção.
- **product-analytics**: KPIs de produto, dashboards, análise de coorte/retenção.
- **product-discovery**: Validação de oportunidade de produto, mapeamento de premissas.
- **product-manager-toolkit**: Toolkit de PM — RICE, análise de entrevista, templates de PRD.
- **product-skills**: Coordenação das 12 sub-skills de produto + 4 plugins standalone.
- **product-strategist**: Liderança estratégica de produto — cascata de OKR, planejamento trimestral.
- **research-summarizer**: Sumarização estruturada de pesquisa para usuários não-técnicos.
- **roadmap-communicator**: Narrativas de roadmap, release notes, updates para stakeholders.
- **saas-scaffolder**: Boilerplate SaaS completo (auth, schema, billing, dashboard) em Next.js.
- **spec-to-repo**: Gera um repositório completo e executável a partir de uma spec em linguagem natural.
- **ui-design-system**: Toolkit de design system UI — tokens, documentação de componente.
- **ux-researcher-designer**: Toolkit de pesquisa/design UX — personas, journey mapping, testes de usabilidade.

### productivity (12 skills)
- **andreessen**: Modo de decisão/produtividade "Marc Andreessen".
- **capture**: Organiza brain dumps caóticos num sistema estruturado sem perda de informação.
- **deep-work**: Planeja dia de deep work, bloqueio de agenda, protege horas de foco.
- **fable-goal**: Converte descrição solta de objetivo num prompt `/goal` polido e autônomo.
- **handoff**: Compacta a conversa atual num documento de handoff para outro agente.
- **inbox-setup** / **inbox-triage**: Setup único de triagem de inbox e execução da triagem completa.
- **meetings**: Decide se vale a pena marcar reunião, precifica em dinheiro, monta agenda.
- **reflect**: Pausa a execução e reavalia direção/premissas/viés no meio da conversa.
- **roast**: "Convoca o painel" para pressionar/validar uma ideia de negócio.
- **swedish-mentor**: Mentor de sueco por nível CEFR usando vídeos/podcasts.
- **weekly-review**: Revisão semanal, fecha loops abertos, audita projetos parados.

### project-management (9 skills)
- **atlassian-admin**: Administração de Jira/Confluence/Bitbucket/Trello (usuários, permissões, governança).
- **atlassian-templates**: Criação/gestão de templates e blueprints Jira/Confluence.
- **confluence-expert**: Criação/gestão de espaços e documentação no Confluence.
- **jira-expert**: Criação/gestão de projetos, JQL, workflows, automação no Jira.
- **meeting-analyzer**: Analisa transcrição de reunião para padrões comportamentais e feedback de coaching.
- **pm-skills**: Coordenação das 8 sub-skills de gestão de projeto.
- **scrum-master**: Scrum Master avançado — análise ágil orientada a dados.
- **senior-pm**: PM sênior para software enterprise/SaaS/transformação digital.
- **team-communications**: Comunicação interna (updates 3P, newsletter, relatório de incidente).

### ra-qm-team (17 skills)
- **agent-decision-receipts**: Recibo assinado (post-quantum) e à prova de adulteração para ação consequente de agente.
- **capa-officer**: Gestão de sistema CAPA para QMS de dispositivo médico.
- **eu-ai-act-specialist**: Compliance operacional com o EU AI Act.
- **fda-consultant-specialist**: Consultoria regulatória FDA para empresas de dispositivo médico.
- **gdpr-dsgvo-expert**: Automação de compliance GDPR e DSGVO (Alemanha).
- **information-security-manager-iso27001** / **isms-audit-expert**: Implementação e auditoria de ISMS ISO 27001.
- **iso42001-specialist**: Especialista em AI Management System ISO/IEC 42001.
- **mdr-745-specialist**: Compliance com o EU MDR 2017/745 (classificação, documentação técnica).
- **qms-audit-expert** / **quality-manager-qms-iso13485**: Auditoria e implementação de QMS ISO 13485.
- **quality-documentation-manager**: Gestão de controle de documento para QMS de dispositivo médico.
- **quality-manager-qmr**: Quality Manager Responsible Person para HealthTech/MedTech.
- **ra-qm-skills**: Router para as 15 skills regulatórias/de qualidade do bundle.
- **regulatory-affairs-head**: Gestão sênior de assuntos regulatórios para HealthTech/MedTech.
- **risk-management-specialist**: Gestão de risco de dispositivo médico conforme ISO 14971.
- **soc2-compliance**: Preparação para auditoria SOC 2, matriz de controle, gap analysis.

### research (10 skills)
- **deep-research**: Investigação de pesquisa multi-fonte disciplinada para decisão de alto risco.
- **deepread**: Leitura profunda de livro/artigo/PDF — extrai claims, constrói mapa de conhecimento.
- **dossier**: Dossiê de pesquisa de entidade (empresa, pessoa, ONG) com hipótese testada.
- **grants**: Pesquisa de grant do NIH para pesquisadores clínicos.
- **litreview**: Revisão de literatura acadêmica (PubMed/OpenAlex) com plano PICO, entrega em .docx.
- **notebooklm**: Automação de navegador para controlar o Google NotebookLM.
- **patent**: Inteligência de prior-art e paisagem de patente.
- **pulse**: Pesquisa de recência multi-fonte (Reddit, HN, web, X) sobre um tópico.
- **research**: Ponto de entrada padrão para pesquisa — roteia para a skill especialista certa.
- **syllabus**: Lista de leitura suplementar a partir de uma ementa de curso.

### research-ops (5 skills)
- **clinical-research**: Desenho de estudo clínico prospectivo (endpoints, tamanho de amostra, GO/NO-GO).
- **market-research**: Metodologia de pesquisa de mercado (TAM/SAM/SOM, tamanho de amostra de survey).
- **product-research**: Planejamento/síntese de pesquisa de produto/usuário (método, saturação de amostra).
- **research-finance**: Orçamento de programa de P&D, burn rate, capitalizar vs despesa.
- **research-ops-skills**: Planejamento/financiamento/síntese de pesquisa enterprise entre workstreams.

## O que não fazer

- Não usar o nome do porto real de Itaqui (ou de qualquer porto/cliente real) em nenhum lugar
  do código, dados de exemplo ou documentação — este é um projeto fictício de portfólio.
- Não depender de APIs pagas (Google Vision, AWS Textract, etc.) — o objetivo é manter o
  projeto 100% gratuito de rodar, já que serve como demonstração pro portfólio.
- Não commitar credenciais ou dados sensíveis.
