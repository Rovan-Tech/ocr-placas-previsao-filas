---
name: prepare-pr
description: Deixa a branch atual pronta e abre o PR - sincroniza com a main (resolvendo conflito se houver), roda os mesmos checks do CI localmente (pytest no backend; Vitest, Playwright e build no frontend), corrige o que falhar, sobe a branch e cria o PR com título e descrição do que foi feito. Use SOMENTE quando o usuário pedir explicitamente para abrir o PR (ex: "abre o PR", "/prepare-pr") — nunca por conta própria ao terminar uma tarefa, pois o usuário precisa testar antes.
---

# prepare-pr

Automatiza tudo que precisa acontecer entre "terminei de codar nesta branch" e "PR aberto,
pronto para revisão", incluindo sincronizar com a `main` e rodar os mesmos checks do CI
localmente antes de subir. Só a `main` é protegida (PR obrigatório); qualquer outra branch pode
receber push livremente.

## Pré-condições

- **O usuário pediu explicitamente para abrir o PR** nesta conversa (ex: "abre o PR", "pode
  subir", `/prepare-pr`). Terminar uma tarefa não é motivo para abrir PR: o usuário precisa
  testar a mudança antes. Sem pedido explícito, não execute este skill — avise que a mudança
  está pronta para ser testada e que o PR será aberto quando ele mandar.
- A branch atual **não pode ser `main`**. Se estiver em `main`, pare e peça para o usuário
  indicar/criar a branch de trabalho antes de continuar — não crie uma branch com nome
  arbitrário sem contexto do que está sendo feito.
- O remote `origin` deve existir e o `gh` CLI deve estar autenticado com acesso de escrita ao
  repositório (`gh auth status`). Se não estiver, pare e avise o usuário.

## Passo a passo

1. **Situação atual**: rode `git status`, `git branch --show-current` e `git log
origin/main..HEAD --oneline` para entender o que já foi commitado nesta branch.

2. **Commitar pendências**: se `git status` mostrar mudanças não commitadas, revise o que
   mudou (`git diff`) e commite com uma mensagem que reflita o "porquê", seguindo o padrão dos
   commits já existentes no repositório (`git log` para ver o estilo). Não deixe nada solto
   antes de continuar.

3. **Sincronizar com a `main`** (é aqui que se pega conflito antes do PR, não depois):

   ```bash
   git fetch origin main
   git merge origin/main
   ```

   - Sem conflito: siga para o próximo passo.
   - Com conflito: resolva você mesmo, arquivo por arquivo. Leia os dois lados do conflito,
     entenda a intenção de cada mudança e escreva o resultado combinado correto — não escolha um
     lado às cegas nem apague código só para o merge "passar". Depois de resolver cada arquivo,
     `git add` nele e, ao final, `git commit` conferindo a mensagem de merge. Se algum conflito
     for ambíguo o suficiente para arriscar quebrar lógica de negócio (OCR, previsão de fila,
     modelos do banco), pare e pergunte ao usuário em vez de adivinhar.

4. **Rodar os checks do CI localmente**, na mesma ordem de `.github/workflows/ci.yml` quando ele
   existir, e corrigir o que falhar antes de seguir. Rode só as partes que já existem no
   repositório (ex: se `frontend/package.json` ainda não existe, pule o bloco do frontend e diga
   isso no PR).

   Backend:

   ```bash
   cd backend
   python -m venv .venv          # só na 1ª vez
   source .venv/Scripts/activate  # Git Bash no Windows; Linux/macOS: .venv/bin/activate
   pip install -r requirements.txt
   pytest
   ```

   Se o CI tiver lint configurado (ex: `ruff`), rode também.

   Frontend:

   ```bash
   cd frontend
   npm install
   npm run test        # Vitest
   npm run test:e2e    # Playwright — requer `npx playwright install chromium` na 1ª vez
   npm run lint        # oxlint
   npm run build       # tsc -b (tipos) + vite build
   ```

   Testes que dependem do PostgreSQL precisam do banco no ar (`docker compose up -d` na raiz).

   Segurança: rode o skill `/security-check` (bandit, pip-audit, npm audit, revisão OWASP e
   pentest da API local). Toda falha encontrada é corrigida com teste de regressão antes de
   seguir. Confira também que a mudança veio com os testes exigidos no CLAUDE.md (pytest,
   Vitest e Playwright conforme o que foi alterado) — se faltar teste, escreva antes de subir.

   Se alguma falha exigir uma correção de comportamento não trivial (não só lint/formatação),
   avalie se a mudança é segura; se houver dúvida sobre a intenção original do código, pare e
   pergunte em vez de "consertar" adivinhando. Depois de qualquer correção, rode a sequência
   completa de novo do início.

5. **Subir a branch**:

   ```bash
   git push -u origin $(git branch --show-current)
   ```

6. **Abrir o PR** com título e descrição gerados a partir do que realmente mudou (releia
   `git log origin/main..HEAD` e `git diff origin/main...HEAD`, não invente):
   - Título: curto (menos de 70 caracteres), no imperativo, resume o efeito da mudança.
   - Descrição: seção `## Summary` com 1-3 bullets do que mudou e por quê, e `## Test plan` com
     checklist do que foi verificado (os checks do passo 4 que rodaram, mais qualquer
     verificação manual relevante).
   - Base sempre `main`. Use heredoc para o body:

   ```bash
   gh pr create --base main --title "título aqui" --body "$(cat <<'EOF'
   ## Summary
   - ...

   ## Test plan
   - [x] pytest (backend)
   - [x] npm run test (frontend)
   - [x] npm run test:e2e (frontend)
   - [x] npm run lint (frontend)
   - [x] npm run build (frontend, inclui tsc)

   ## Security
   - [x] bandit / pip-audit / npm audit
   - [x] pentest da API local (/security-check)
   - achados e correções: ...
   EOF
   )"
   ```

7. **Reportar** a URL do PR ao usuário. Não faça merge do PR — a responsabilidade deste skill
   termina em abrir o PR pronto para revisão.

## O que não fazer

- Não force-push (`git push --force`) para sincronizar com a `main` — sempre merge, nunca rebase
  de uma branch que já foi para o `origin`, a não ser que o usuário peça explicitamente.
- Não resolva conflito de merge apagando um dos lados sem entender a intenção; quando em dúvida,
  pergunte.
- Não pule nenhum dos checks do passo 4 para "economizar tempo".
- Não faça merge/approve do próprio PR.
- Não commite `.env`, credenciais ou imagens de placas reais.
