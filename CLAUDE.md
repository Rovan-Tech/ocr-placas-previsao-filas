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
- **Frontend**: React (Vite)
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
```

Frontend:
```bash
cd frontend
npm install
npm run dev
npm run test          # Vitest
npm run test:e2e      # Playwright
```

Banco:
```bash
docker compose up -d   # sobe o PostgreSQL local
```

## Testes são obrigatórios

Toda funcionalidade nova ou alterada precisa vir acompanhada de:

1. **Backend**: teste com `pytest` para qualquer lógica de OCR, previsão de fila ou endpoint
   novo/alterado.
2. **Frontend**: teste unitário (Vitest) para lógica em `src/services`, e teste e2e
   (Playwright) para qualquer fluxo visível/interativo novo (captura de foto, listagem de
   check-ins, etc.) — usar seletores semânticos (`getByRole`), não classes CSS.

Um PR com testes quebrados ou faltando não deve ser mergeado.

## Antes de abrir PR

A `main` é protegida: só aceita mudanças via PR, com CI passando (lint, testes de backend e
frontend, build). Antes de abrir PR:

1. Sincronizar a branch atual com a `main`.
2. Rodar localmente: `pytest` (backend), `npm run test` e `npm run test:e2e` (frontend).
3. Corrigir o que falhar antes de abrir o PR.
4. Abrir o PR com um resumo claro do que mudou e por quê.

Quando o repositório tiver um skill `/prepare-pr` configurado (nos moldes do usado no site
institucional da Rovan, em `.claude/skills/prepare-pr/`), ele deve automatizar esses passos:
sincronizar com a main, rodar os checks localmente e já abrir o PR.

## O que não fazer

- Não usar o nome do porto real de Itaqui (ou de qualquer porto/cliente real) em nenhum lugar
  do código, dados de exemplo ou documentação — este é um projeto fictício de portfólio.
- Não depender de APIs pagas (Google Vision, AWS Textract, etc.) — o objetivo é manter o
  projeto 100% gratuito de rodar, já que serve como demonstração pro portfólio.
- Não commitar credenciais ou dados sensíveis.
