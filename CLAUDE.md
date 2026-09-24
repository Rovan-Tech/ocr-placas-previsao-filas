# CLAUDE.md

Guia para quem (humano ou Claude Code) for trabalhar neste repositório.

## O que é este projeto

Projeto de portfólio da Rovan: sistema de OCR de placas e previsão de filas para o **Porto
Baía Verde** (nome fictício, criado só para este case de portfólio — não representa o porto
real de Itaqui nem qualquer outro porto existente).

O fiscal na guarita aponta a câmera do celular (ou uma câmera fixa) para a placa do caminhão,
o sistema lê a placa via OCR e faz o check-in automático. Um algoritmo simples estima o tempo
de espera com base no histórico de caminhões já registrados.

É um projeto de demonstração para mostrar no site da Rovan — sem cliente real por trás, mas
construído com qualidade de produção para servir de portfólio técnico.

## Stack

- **Backend**: Python + FastAPI
- **OCR**: Tesseract OCR ou EasyOCR (open-source, sem custo de API) + OpenCV para localizar e
  recortar a placa na imagem antes do OCR
- **Frontend**: React + TypeScript (Vite), em modo `strict` — código novo é sempre `.ts`/`.tsx`,
  sem `any` implícito; os tipos das respostas da API ficam em `src/services/api.ts`
- **Banco de dados**: PostgreSQL (via Docker Compose em desenvolvimento)
- **Testes backend**: pytest
- **Testes frontend**: Vitest (unitário) + Playwright (e2e)

## Estrutura

```
backend/
  app/
    routers/       endpoints da API (ex: check-in, fila)
    services/       lógica de OCR e previsão de fila
    models/         modelos do banco (SQLAlchemy)
    main.py         entrypoint do FastAPI
  tests/            testes com pytest
  requirements.txt / pyproject.toml
frontend/
  src/
    components/     captura de câmera, lista de check-ins
    pages/
    services/       chamadas à API do backend
  tests/            Vitest (unit) + Playwright (e2e)
docker-compose.yml  sobe o PostgreSQL local
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

## Código sem comentários

Código autoexplicativo: nomes de variável/função claros em vez de comentário explicando o óbvio.
**Nenhum comentário (`#`, `//`, `/* */`, docstring) fica no código** — nem em português
explicando "o quê", nem docstring de função. Decisão não-óbvia de negócio/segurança vai para o
`CLAUDE.md` do módulo ou a mensagem do commit, não para dentro do código. Exceção: diretivas que
mudam o comportamento de uma ferramenta (`# noqa`, `# nosec`, `# type: ignore`,
`// eslint-disable`, `/// <reference`) continuam — removê-las reintroduz avisos que o projeto já
silenciou de propósito.

Ao terminar qualquer tarefa (e sempre antes de `/prepare-pr`), rode o skill `/clean-code` nos
arquivos alterados — ver `.claude/skills/clean-code/SKILL.md`.

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
`/clean-code`, `/security-check`, os testes do backend (`pytest`) e do frontend (Vitest,
Playwright, build), corrige o que falhar e abre o PR — ver `.claude/skills/prepare-pr/SKILL.md`.

### PR de outra pessoa com CI falhando

Quando o CI falhar num PR aberto por outro colaborador (ex: Leandro), **não corrija o código
dela/dele** — comente no PR (`gh pr comment <número>`) detalhando exatamente onde falhou: qual
teste, o valor esperado vs o obtido, e um resumo do padrão do erro (ex: "maioria dos casos
devolveu `None`" ou "confundiu os caracteres X↔Y"). O autor corrige e sobe novos commits na
mesma branch — o CI roda de novo sozinho, não precisa de PR novo.

## O que não fazer

- Não usar o nome do porto real de Itaqui (ou de qualquer porto/cliente real) em nenhum lugar
  do código, dados de exemplo ou documentação — este é um projeto fictício de portfólio.
- Não depender de APIs pagas (Google Vision, AWS Textract, etc.) — o objetivo é manter o
  projeto 100% gratuito de rodar, já que serve como demonstração pro portfólio.
- Não commitar credenciais ou dados sensíveis.
