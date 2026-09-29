# Design system

Fonte de verdade: [`frontend/src/index.css`](../frontend/src/index.css) (bloco `:root`). Este
documento é a leitura humana dessa mesma fonte — se os dois divergirem, o CSS manda. Regras de
uso (o que é proibido/obrigatório) estão em
[`.claude/rules/design-system.md`](../.claude/rules/design-system.md).

## O que foi consolidado

Este projeto já tinha uma paleta e tipografia consistentes em `index.css` antes desta rodada —
não havia inconsistência de "vários azuis quase iguais" nem fonte trocada para a mesma função.
O que estava faltando era a **camada de base** (escala 50–900) por trás dos tokens semânticos
que já existiam. O que foi feito:

- `--primary`, `--success`, `--error`, `--accent-text` passaram a apontar para um degrau da nova
  escala base (`--color-primary-500`, `--color-error-500`, `--color-secondary-500`) em vez de
  repetir o hex — mesmo valor renderizado, uma fonte a menos para divergir no futuro.
- `--muted` passou a apontar para `--color-neutral-500` (mesmo hex de antes).
- **Novo, ainda não usado em nenhum componente**: uma escala `info` (`--color-info-*` /
  `--info-text` / `--info-bg`), porque não existia um tom semântico genérico de "informação"
  (só sucesso/alerta/erro/revisão). Não é uma cor inventada do zero — o degrau 500 foi derivado do
  azul já usado como indicador de papel "supervisor" no `Layout`/login (`#60a5fa`), escurecido o
  suficiente para passar em contraste de texto. **Pendente da sua validação**: se não fizer
  sentido ter um tom "info" separado de "revisão" (`--accent-*`), removemos.

## Paleta base (escalas 50–900)

| Escala | 500 (base) | Onde já era usado antes desta consolidação |
| --- | --- | --- |
| `primary` | `#0b5d4a` | `--primary`, `--success` |
| `secondary` | `#7a4a00` | `--accent-text` (estado "revisão") |
| `neutral` | `#5d6b64` | `--muted` |
| `error` | `#b3261e` | `--error` |
| `info` | `#3672c4` | novo (ver acima) |

Tabela completa de degraus está em `frontend/src/index.css`. Uso: **componente usa só token
semântico** (`var(--primary)`, `var(--error)`...) — a escala base existe para dar consistência
entre semânticos e para casos futuros (ex.: um gráfico com várias séries), nunca hex solto.

### Contraste WCAG 2.2 AA (texto normal ≥ 4.5:1, texto grande/UI ≥ 3:1)

Calculado contra fundo branco (`--surface` no tema claro), fórmula de luminância relativa padrão:

| Token | Hex | Contraste sobre branco | Passa AA texto normal? |
| --- | --- | --- | --- |
| `--primary` / `--success` (500) | `#0b5d4a` | 7.84:1 | ✅ (passa até AAA) |
| `--error` (500) | `#b3261e` | 6.54:1 | ✅ |
| `--accent-text` / secondary (500) | `#7a4a00` | 7.48:1 | ✅ |
| `--muted` / neutral (500) | `#5d6b64` | 5.60:1 | ✅ |
| `--info-text` (degrau 600) | `#2d60a5` | 6.31:1 | ✅ (degrau 500 sozinho dá 4.82:1, ainda passa, 600 usado por margem) |

Tema escuro: `--text` (`#eaf1ee`) sobre `--bg` (`#101513`) dá 16.08:1; `--primary` escuro
(`#4fbe95`) sobre o mesmo fundo dá 8.02:1 — ambos folgados acima do mínimo.

## Tipografia

| Uso | Variável | Família | Fallback |
| --- | --- | --- | --- |
| Títulos (`h1`-`h3`) | `--font-brand` | Space Grotesk | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |
| Texto/interface | `--font-body` | IBM Plex Sans | `system-ui, -apple-system, 'Segoe UI', sans-serif` |
| Placa/monoespaçado | `--font-mono` | JetBrains Mono | `ui-monospace, 'SFMono-Regular', Menlo, monospace` |

Escala: `--text-xs` (0.75rem) → `--text-3xl` (2.5rem), `line-height: 1.5` no corpo. Todo fallback
já é fonte de sistema — sem *layout shift* perceptível enquanto a fonte web carrega (adicionar
`font-display: swap` no `@font-face`/link do Google Fonts quando as fontes forem carregadas via
rede, hoje o projeto não versiona o `<link>` de fonte — checar `index.html`/CDN usado em produção
antes do próximo PR que mexer em fonte).

## Espaçamento, raio, sombra

- Espaçamento em base 4px: `--space-1` (4px) até `--space-6` (48px).
- Raio: `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px).
- Sombra: `--shadow-sm`, `--shadow-md` (ambas redefinidas no tema escuro com opacidade maior).
- Breakpoint mobile: `--bp-mobile-max: 640px` (mobile-first, guarita usa celular em campo).

## Acessibilidade (WCAG 2.2 AA)

- Contraste: ver tabela acima — todo token de texto sobre `--surface`/`--bg` já passa.
- Foco visível: `:focus-visible` com outline de 2px na cor `--primary` em botão, campo, toggle de
  tema (ver `.theme-toggle:focus-visible`, `.form input:focus` em `index.css`).
- Estado nunca só por cor: mensagens de erro/aviso/revisão (`.message.error`, `.message.warning`,
  `.message.review`) têm rótulo textual (`<strong>`), não só a cor de fundo.
- Alvo de toque ≥ 44px (`button { min-height: 44px }`, já padrão no projeto).

## Estados de componente

Botão e campo já cobrem hover/focus/active/disabled (`index.css`, seção `button`/`.form`).
Tela nova precisa cobrir também **carregando**, **erro** e **vazio** — ver
`.claude/rules/design-system.md` e a skill `a11y-audit` para o checklist ao adicionar uma tela.
