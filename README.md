# OCR de Placas e Previsão de Filas

> **Projeto de exemplo/portfólio da [Rovan Tech](https://rovantech.com.br)** — não é um sistema
> em produção nem foi desenvolvido para um cliente real. Serve para demonstrar como a Rovan
> aborda um problema real de operação usando visão computacional e dados históricos, com uma
> stack 100% gratuita.
>
> O "Porto Baía Verde" citado abaixo é um nome fictício, criado só para este case — não
> representa nenhum porto real.

Um recurso de IA que automatiza o check-in de caminhões na guarita de um pátio/porto, lendo a
placa por OCR e estimando o tempo de espera com base no histórico de entradas.

## O que o projeto resolve

No cenário do case, o fiscal na guarita do Porto Baía Verde anota manualmente a placa de cada
caminhão que chega. Isso é lento, sujeito a erro de digitação e não gera nenhum dado histórico
aproveitável para organizar a fila do pátio.

A solução: o fiscal aponta a câmera do celular (ou uma câmera fixa) para a placa do caminhão. O
sistema:

1. Localiza e recorta a placa na imagem (OpenCV)
2. Lê os caracteres via OCR (Tesseract OCR ou EasyOCR)
3. Registra o check-in automaticamente no banco
4. Estima o tempo de espera do caminhão com base no histórico recente (média móvel dos
   check-ins salvos)

**Impacto para o cliente:** elimina a digitação manual da placa, reduz o erro humano no registro
de entrada, acelera a entrada de veículos no pátio e gera histórico estruturado — que hoje não
existe — como base para decisões futuras (ex: dimensionar melhor os horários de pico).

## Stack

100% gratuita — nenhum serviço pago envolvido, roda inteiramente local para demonstração.

| Camada   | Tecnologia                                      |
| -------- | ------------------------------------------------ |
| Backend  | Python + FastAPI                                  |
| OCR      | Tesseract OCR ou EasyOCR (open-source) + OpenCV   |
| Frontend | React + TypeScript + Vite                         |
| Banco    | PostgreSQL (via Docker)                           |

## Estrutura do repositório

```
.
├── backend/             # API FastAPI, OCR/OpenCV, cálculo da fila estimada
├── frontend/            # Interface React usada pelo fiscal na guarita
├── docker/              # Scripts de inicialização do PostgreSQL
├── scripts/dev.mjs      # `npm run dev`: sobe o ambiente inteiro
└── docker-compose.yml   # PostgreSQL local (docker compose up -d)
```

## Como rodar localmente

Pré-requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) aberto,
Python 3.11+ e Node 20+.

**Tudo com um comando** (na raiz do repositório):

```bash
npm run dev
```

Ele sobe o PostgreSQL no Docker, cria a venv e instala as dependências do backend e do frontend
quando necessário (`pip install` e `npm ci`), aplica as migrações e roda o FastAPI e o Vite juntos, abrindo o app no
navegador:

| O quê         | Endereço                     |
| ------------- | ---------------------------- |
| App (guarita) | http://localhost:5173        |
| API           | http://localhost:8002        |
| Docs da API   | http://localhost:8002/docs   |
| PostgreSQL    | `localhost:5433` (`ocr`/`ocr`) |

Ctrl+C encerra backend e frontend; o banco continua no Docker (`docker compose stop` para parar).
A primeira execução demora mais por causa da instalação do EasyOCR; nas seguintes, só reinstala
o que mudou em `requirements.txt` ou `package-lock.json`. Use `npm run dev -- --no-open` para não
abrir o navegador.

### Passo a passo manual

**1. Banco de dados (PostgreSQL via Docker)**

```bash
docker compose up -d
```

**2. Backend (FastAPI)**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**3. Frontend (React + TypeScript + Vite)**

```bash
cd frontend
npm install
npm run dev
```

Nenhuma chave de API é necessária — o OCR roda localmente com Tesseract/EasyOCR, sem depender de
serviço pago de terceiros.

## Como pensamos desenvolver

MVP local, validado com um dataset de teste de placas no padrão Mercosul. A fila estimada é
calculada por média móvel simples sobre o histórico de check-ins salvo no PostgreSQL — sem
depender de nenhuma API paga, o suficiente para rodar 100% local numa demonstração.

## Status

🚧 Em desenvolvimento — este README descreve o escopo do MVP; a implementação do backend e do
frontend está começando.
