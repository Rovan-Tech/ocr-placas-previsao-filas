# Git

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` — como já é a
  prática deste repositório (ver `git log`). Corpo da mensagem em português quando explica
  contexto de negócio, cabeçalho pode ficar em inglês (ambos os estilos já convivem no histórico).
- **Commits pequenos e atômicos**: um commit = uma mudança logicamente completa (código + teste
  juntos, ver [`testing.md`](testing.md)) — não misturar refactor não pedido com a feature no
  mesmo commit.
- **Branches**: `feat/<descrição-curta>`, `fix/<descrição-curta>`, `chore/<descrição-curta>` a
  partir de `main` atualizada.
- **Nunca commitar direto na `main`** — ela só aceita mudança via PR com CI verde (já é regra
  branch-protected).
- **Commit e push só com autorização explícita do usuário** — vale para qualquer sessão do Claude
  Code neste repositório, mesmo com o fluxo de code-reviewer/qa-tester aprovado: aprovação de
  qualidade não é aprovação para commitar/subir.
