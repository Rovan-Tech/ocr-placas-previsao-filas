---
paths:
  - "frontend/src/**/*.{ts,tsx}"
  - "frontend/tests/**/*.{ts,tsx}"
---

# TypeScript / React (frontend)

Gate: `npm run lint` (oxlint) + `npm run typecheck` (`tsc -b`, `strict` já ligado em
`tsconfig.app.json`) + `npm run format:check` (Prettier) fazem parte de
`python scripts/quality_gate.py --fast`.

## Tipagem

- `strict` do TypeScript já está ligado (`noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters` inclusos) — não desligar nenhuma dessas flags em `tsconfig.app.json` sem
  aprovação explícita (é uma config de qualidade, ver regra de hooks/permissões).
- Sem `any` implícito nem explícito (`.claude/rules` + `CLAUDE.md` raiz já pedem isso). Tipo
  desconhecido de verdade (ex.: resposta de terceiro sem tipo) usa `unknown` e faz narrowing antes
  de usar.
  - ✅ `function isApiError(v: unknown): v is ApiError { return typeof v === 'object' && v !== null && 'detail' in v }`
  - ❌ `function handle(err: any) { console.log(err.detail) }`
- Tipos de resposta/request da API ficam só em `src/services/api.ts` (fonte única) — componente
  não redeclara um tipo parecido com campo a mais/a menos.

## Componentes e hooks

- Componente novo é sempre `.tsx`, função nomeada (não `React.FC`), props tipadas com `interface`
  ou `type` próprio do arquivo (nunca `any` nas props). Hook customizado começa com `use` e segue
  `react/rules-of-hooks` (já ligado no `oxlint`, ver `frontend/.oxlintrc.json`).
- Responsabilidade única: componente de página (`pages/`) monta layout e orquestra estado;
  lógica de formatação/validação pura vai para `services/` (ex.: `plate.ts`, `statusMessage.ts`,
  `checkinsTrend.ts`) para poder testar sem montar componente.

## Limites objetivos

- Componente/arquivo ≤ 400 linhas, função/handler ≤ 40 linhas, ≤ 5 props "soltas" (acima disso,
  agrupar num objeto). Mesmo limite de duplicação do Python: bloco repetido com 6+ linhas vira
  função/hook compartilhado — sem criar abstração para um caso hipotético futuro.

## Erros e estados de UI

- Toda chamada à API trata erro explicitamente (nunca promise sem `.catch` ou `try` vazio) e
  mostra estado de erro visível ao fiscal — nunca falha silenciosa. Estados de carregando/vazio/erro
  são obrigatórios em qualquer tela nova (ver `.claude/rules/design-system.md` e `a11y-audit`).

## Tokens de design

- Cor, fonte, espaçamento e raio vêm sempre de `frontend/src/index.css` (variáveis `--*`) — nunca
  hex/rgb/hsl solto nem `font-family`/`px` mágico em componente. Ver
  [`.claude/rules/design-system.md`](design-system.md) e [`docs/design-system.md`](../../docs/design-system.md).

## Sem comentários nem JSDoc

Mesma regra do Python (ver [`.claude/rules/python.md`](python.md) e "Código sem comentários" no
`CLAUDE.md` raiz): nome de variável/função/componente claro substitui comentário. Exceção só para
diretiva de ferramenta: `// eslint-disable-next-line <regra>`, `/// <reference ... />`.

## Nomes e imports

- `camelCase` para função/variável, `PascalCase` para componente/tipo, booleano com
  `is`/`has`/`can` (`isAuthenticated`, `hasError`). Import absoluto a partir de `src/` quando o
  projeto configurar alias; até lá, relativo curto é aceitável — não criar import circular entre
  `pages/` → `components/` → `services/` (a direção é sempre essa, nunca o inverso).
