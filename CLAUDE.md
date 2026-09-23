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

A API já envia headers de segurança em toda resposta (`SECURITY_HEADERS` em `app/main.py`).
Pendências conhecidas para antes do deploy público: rate limiting no `/ocr/upload`, CORS
restrito à origem do frontend (hoje não há CORS habilitado), CSP no frontend e subir o uvicorn
com `--no-server-header` em produção.

## Antes de abrir PR

A `main` é protegida: só aceita mudanças via PR, com CI passando (lint, testes de backend e
frontend, build). Rode o skill `/prepare-pr`: ele sincroniza a branch com a `main`, roda
`/security-check`, os testes do backend (`pytest`) e do frontend (Vitest, Playwright, build),
corrige o que falhar e abre o PR — ver `.claude/skills/prepare-pr/SKILL.md`.

## O que não fazer

- Não usar o nome do porto real de Itaqui (ou de qualquer porto/cliente real) em nenhum lugar
  do código, dados de exemplo ou documentação — este é um projeto fictício de portfólio.
- Não depender de APIs pagas (Google Vision, AWS Textract, etc.) — o objetivo é manter o
  projeto 100% gratuito de rodar, já que serve como demonstração pro portfólio.
- Não commitar credenciais ou dados sensíveis.
