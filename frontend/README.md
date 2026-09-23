# Frontend

Interface em React (Vite) usada pelo fiscal na guarita:

- Captura da foto da placa (câmera do celular/navegador) e envio para o OCR do backend
- Lista dos check-ins recentes

## Rodando localmente

Com o backend já rodando em `http://localhost:8000` (ver `backend/README.md`):

```bash
npm install
npm run dev
```

O app sobe em `http://localhost:5173`. O dev server repassa as chamadas de `/api/*` para o
backend (proxy em `vite.config.js`), então não é preciso configurar CORS no FastAPI. Para apontar
para outro endereço, copie `.env.example` para `.env` e ajuste `VITE_BACKEND_URL`.

### Testando no celular

O dev server fica exposto na rede local (`host: true`), então dá para abrir
`http://<ip-da-máquina>:5173` no celular. Nesse caso o navegador bloqueia a câmera ao vivo
(`getUserMedia` só funciona em HTTPS ou `localhost`), e a tela troca automaticamente para o botão
**Fotografar placa**, que abre a câmera nativa do aparelho. O resultado é o mesmo.

## Estrutura

```
src/
├── components/   # Layout, CameraCapture (câmera + upload), OcrResult
├── pages/        # CapturePage (/), CheckinsPage (/checkins)
└── services/     # api.js — chamadas ao backend
```

## Integração com o backend

| Tela                | Endpoint                 | Status                   |
| ------------------- | ------------------------ | ------------------------ |
| Capturar placa      | `POST /ocr/upload`       | ✅ existe                |
| Check-ins recentes  | `GET /checkins?limit=20` | ⏳ ainda não implementado |

A tela de check-ins espera uma lista de objetos com `id`, `plate`, `created_at` (ISO 8601) e
`estimated_wait_minutes`. Enquanto o endpoint não existir, a tela mostra um aviso no lugar da
lista.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção em `dist/`
- `npm run lint` — lint com oxlint
