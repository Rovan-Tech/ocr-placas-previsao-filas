# Frontend

Interface em React + TypeScript (Vite) usada pelo fiscal na guarita:

- Login com usuário e senha (obrigatório — ver "Login" abaixo)
- Captura da foto da placa (câmera do celular/navegador) e envio para o OCR do backend, com
  digitação manual como alternativa (câmera não lê, ou o fiscal prefere digitar)
- Lista dos check-ins recentes
- Logs de quem enviou cada foto/placa, de onde, e o que a leitura deu
- Check-in inteligente: o resultado do OCR já mostra se a placa tem agendamento (motorista,
  validação por OCR do documento, produtos da carga, data — com aviso explícito de "chegou
  adiantado"/"Atrasado"), os dados do veículo trazidos pela API Brasil (ou um perfil fictício
  sinalizado como "dados de exemplo", quando a API Brasil não está configurada no backend), ou
  que a placa não foi reconhecida em nenhuma fonte. Sem agendamento, dá pra cadastrar o
  motorista/carga/caminhão ali mesmo, sem sair da tela de captura. Em qualquer resultado, o
  fiscal autoriza ou recusa a entrada, e dá pra abrir a foto da frente ou do verso do documento
  do motorista numa aba nova
- Cadastro de agendamento de chegada completo (placa, dados do motorista incluindo data/local de
  nascimento com UF e tipo de documento, dados do veículo, origem/destino, lista de produtos da carga
  com categoria de risco, e as quatro fotos — frente e verso do documento do motorista, documento
  do veículo e manifesto de carga — todas obrigatórias) — qualquer funcionário, não só admin
- Cadastro e exclusão de funcionário (só para quem é admin master)
- Tema claro/escuro à escolha (segue o sistema até o fiscal trocar manualmente)

## Rodando localmente

Com o backend já rodando em `http://localhost:8002` (ver `backend/README.md`, inclusive como
criar o primeiro login):

```bash
npm install
npm run dev
```

O app sobe em `http://localhost:5173`. O dev server repassa as chamadas de `/api/*` para o
backend (proxy em `vite.config.ts`), então não é preciso configurar CORS no FastAPI. Para apontar
para outro endereço, copie `.env.example` para `.env` e ajuste `VITE_BACKEND_URL`.

### Login

A tela de captura só aparece depois do login (`POST /auth/login`, ver `backend/README.md` para
criar o primeiro usuário). O token fica em `localStorage` (não a senha — ver
`src/context/AuthContext.tsx`), então recarregar a página não pede login de novo; "Sair", no
cabeçalho, limpa a sessão. No primeiro login (senha temporária) e a cada 30 dias, a tela de troca
de senha aparece sozinha, e nada mais funciona até a senha ser trocada — isso é decidido pelo
backend, não pelo frontend (ver `mustChangePassword` em `AuthContext.tsx`).

### Tema e fonte

O botão no canto (visível até antes do login) alterna entre claro e escuro; a escolha fica em
`localStorage` e vale até o fiscal trocar de novo (`src/context/ThemeContext.tsx`, grava
`data-theme` no `<html>`). A fonte (Space Grotesk, importada no `index.html`) é escolhida de
propósito diferente da usada no site institucional da Rovan Tech — este é um projeto de
portfólio fictício, sem identidade visual em comum com o site real da empresa.

### Testando no celular

O dev server fica exposto na rede local (`host: true`), então dá para abrir
`http://<ip-da-máquina>:5173` no celular. Nesse caso o navegador bloqueia a câmera ao vivo
(`getUserMedia` só funciona em HTTPS ou `localhost`), e a tela troca automaticamente para o botão
**Fotografar placa**, que abre a câmera nativa do aparelho. O resultado é o mesmo.

## Estrutura

```
src/
├── components/   # Layout, CameraCapture, ManualPlateEntry, OcrResult (inclui o check-in
│                 # inteligente), ScheduleForm (cadastro de agendamento — reaproveitado na
│                 # tela de captura, quando não há agendamento, e em /agendamentos), ThemeToggle
├── context/      # AuthContext (sessão/token/"precisa trocar senha"), ThemeContext (claro/escuro)
├── pages/        # LoginPage, ChangePasswordPage, CapturePage (/), CheckinsPage (/checkins),
│                 # LogsPage (/logs), CreateSchedulePage (/agendamentos), CreateEmployeePage
│                 # (/funcionarios — lista, cadastra e exclui, só admin)
└── services/     # api.ts (chamadas autenticadas, inclui agendamento/check-in), auth.ts
                  # (login/troca de senha/funcionários), authToken.ts (ponte entre api.ts e o
                  # AuthContext, sem depender do React)
tests/
├── unit/         # Vitest — src/services
└── e2e/          # Playwright — fluxos de login, captura e listagem (backend mockado com
                  # page.route; testAuth.ts pré-autentica a sessão pros testes que não são sobre login)
```

## Integração com o backend

Toda chamada, exceto o próprio login, exige estar autenticado — `api.ts` anexa
`Authorization: Bearer <token>` sozinho (o token vem de `services/authToken.ts`, atualizado pelo
`AuthContext` a cada login/logout). Um 401 desloga globalmente; um 403 com
`detail.code === "password_change_required"` leva pra tela de trocar senha — ver `request()` em
`api.ts`.

| Tela                       | Endpoint                                  | Status                   |
| --------------------------- | ------------------------------------------ | ------------------------ |
| Login                      | `POST /auth/login`                        | ✅ existe |
| Troca de senha             | `POST /auth/change-password`              | ✅ existe |
| Funcionários (listar/cadastrar/excluir) | `GET`/`POST /auth/employees`, `DELETE /auth/employees/{id}` | ✅ existe (só admin) |
| Capturar placa (com check-in inteligente) | `POST /ocr/upload`, `POST /ocr/manual`    | ✅ existe |
| Logs                       | `GET /logs`, `GET /logs/{id}/photo`       | ✅ existe |
| Agendamentos (listar/cadastrar) | `GET`/`POST /schedules`               | ✅ existe |
| Autorizar/recusar entrada  | `POST /checkins`                          | ✅ existe |
| Check-ins recentes         | `GET /checkins?limit=20`                  | ✅ existe |

A tela de check-ins lista `id`, `plate`, `created_at` (ISO 8601), `status`
(`waiting`/`admitted`/`cancelled`) e `estimated_wait_minutes` (previsão de fila por média móvel,
ou tempo real já decorrido pra check-ins já decididos — ver `backend/README.md`), com um gráfico
de tendência desse tempo de espera ao longo do turno.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — checagem de tipos (`tsc -b`) + build de produção em `dist/`
- `npm run typecheck` — só a checagem de tipos
- `npm run lint` — lint com oxlint
- `npm run test` — testes unitários (Vitest)
- `npm run test:e2e` — testes e2e (Playwright; na primeira vez, rode `npx playwright install chromium`).
  Os testes sobem o próprio Vite na porta 4173 e mockam o backend, então não precisam do FastAPI
  rodando. A câmera é simulada pelo Chromium (`--use-fake-device-for-media-stream`).
