---
paths:
  - "frontend/src/**/*.{ts,tsx,css}"
  - "frontend/index.html"
---

# Design system (uso obrigatório)

Tokens e paleta completa: [`docs/design-system.md`](../../docs/design-system.md). Fonte única de
verdade: [`frontend/src/index.css`](../../frontend/src/index.css) (`:root`). Este arquivo é o
checklist verificável que o `code-reviewer` confere.

- **Proibido hex/rgb/hsl fora de `index.css`.** Cor em componente/CSS module é sempre
  `var(--token-semântico)` (`var(--primary)`, `var(--error)`, `var(--text)`...). Precisa de uma
  cor que não existe? Adiciona o token em `index.css` (com o degrau da escala base por trás),
  não solta o hex no componente.
  - ✅ `color: var(--error);`
  - ❌ `color: #b3261e;`
- **Componente usa só token semântico, nunca a escala base diretamente**
  (`var(--color-primary-500)` dentro de um componente é proibido — só `index.css` referencia a
  escala base). Isso mantém uma única troca de lugar se a marca mudar de cor.
- **Fonte**: só `var(--font-brand)` (títulos), `var(--font-body)` (texto) ou `var(--font-mono)`
  (placa/código) — nunca `font-family` inline nova.
- **Espaçamento/raio**: só `var(--space-N)`/`var(--radius-*)` — nunca `px`/`rem` mágico solto num
  `margin`/`padding`/`gap` novo (pequenos ajustes de 1px de borda são aceitáveis).
- **Tema escuro**: se adicionar um token semântico novo em `:root`, redefinir o mesmo token em
  `:root[data-theme='dark']` quando o valor não fizer sentido igual nos dois temas (ver o bloco
  dark já existente em `index.css` como referência).
- **Estados obrigatórios em componente interativo novo**: hover, focus (visível,
  `:focus-visible`), active, disabled — e, em tela (não componente solto), também carregando, erro
  e vazio. Ver skill `a11y-audit` para o checklist completo de WCAG 2.2 AA (a guarita opera em
  campo, às vezes com luz ruim — contraste e alvo de toque ≥44px importam de verdade aqui, não é
  só formalidade).
- **Mobile-first**: `--bp-mobile-max: 640px` já é o breakpoint do projeto — testar layout em
  375px antes de dar por pronta uma tela nova (ver `qa-tester`).
