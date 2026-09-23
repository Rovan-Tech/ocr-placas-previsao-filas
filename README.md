# OCR de Placas e Previsão de Filas

Case de portfólio da [Rovan Tech](https://rovantech.com.br): um recurso de IA que automatiza o
check-in de caminhões na guarita de um pátio/porto, lendo a placa por OCR e estimando o tempo de
espera com base no histórico de entradas.

> O "Porto Baía Verde" citado abaixo é um nome fictício, criado só para este case de portfólio —
> não representa o porto de Itaqui nem qualquer outro porto real.

## O problema

No cenário do case, o fiscal na guarita do Porto Baía Verde anota manualmente a placa de cada
caminhão que chega. Isso é lento, sujeito a erro de digitação e não gera nenhum dado histórico
aproveitável para organizar a fila do pátio.

## A solução

O fiscal aponta a câmera do celular (ou uma câmera fixa) para a placa do caminhão. O sistema:

1. Localiza e recorta a placa na imagem (OpenCV)
2. Lê os caracteres via OCR (Tesseract OCR ou EasyOCR)
3. Registra o check-in automaticamente no banco
4. Estima o tempo de espera do caminhão com base no histórico recente (média móvel dos
   check-ins salvos)

## Impacto para o cliente

- Elimina a digitação manual da placa
- Reduz o erro humano no registro de entrada
- Acelera a entrada de veículos no pátio
- Gera histórico estruturado, que hoje não existe, como base para decisões futuras (ex:
  dimensionar melhor os horários de pico)

## Stack

100% gratuita — nenhum serviço pago envolvido, roda inteiramente local para demonstração.

| Camada   | Tecnologia                                    |
| -------- | ---------------------------------------------- |
| Backend  | Python + FastAPI                                |
| OCR      | Tesseract OCR ou EasyOCR (open-source) + OpenCV |
| Frontend | React + Vite                                    |
| Banco    | PostgreSQL (via Docker)                         |

## Estrutura do repositório

```
.
├── backend/    # API FastAPI, OCR/OpenCV, cálculo da fila estimada
└── frontend/   # Interface React usada pelo fiscal na guarita
```

## Como pensamos desenvolver

MVP local, validado com um dataset de teste de placas no padrão Mercosul. A fila estimada é
calculada por média móvel simples sobre o histórico de check-ins salvo no PostgreSQL — sem
depender de nenhuma API paga, o suficiente para rodar 100% local numa demonstração.

## Status

🚧 Em desenvolvimento — este README descreve o escopo do MVP; a implementação está começando.
