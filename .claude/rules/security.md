# Segurança

Regras gerais e verificáveis pelo gate/subagentes. O detalhe do "porquê" de cada decisão de
segurança já tomada (CORS, rate limit, headers) está em ["Segurança é obrigatória"](../../CLAUDE.md)
no `CLAUDE.md` raiz — este arquivo é o checklist operacional que o `code-reviewer` confere linha a
linha.

- **Validação de entrada na fronteira**: todo dado que entra por `routers/` (body, query, path,
  upload) é validado (Pydantic/`Depends`) antes de chegar a um `service`. Nunca confiar em dado já
  validado "rio abaixo" de novo — mas também nunca validar duas vezes a mesma coisa em duas
  camadas (isso é o tipo de duplicação que o `code-reviewer` marca como redundante).
- **Query sempre parametrizada**: acesso a banco só via SQLAlchemy ORM ou `text()` com bind params
  nomeados — nunca f-string/`%`/`.format()` montando SQL com valor vindo do request. `bandit`
  (`S608`) e o pentest do `/security-check` cobrem isso.
- **Sem `eval`, `exec`, `pickle` ou `subprocess` com entrada do usuário** — nenhuma exceção.
- **CSRF**: a API usa JWT Bearer no header `Authorization` (nunca cookie de sessão), então não há
  superfície CSRF clássica hoje. Se algum endpoint futuro passar a autenticar por cookie, essa
  decisão precisa vir com proteção CSRF (`SameSite`, token) no mesmo PR.
- **Upload de arquivo**: tipo (`ALLOWED_CONTENT_TYPES`), tamanho (`MAX_UPLOAD_BYTES`) e resolução
  (`MAX_IMAGE_PIXELS`, contra decompression bomb) sempre validados antes de processar; nome de
  arquivo em disco nunca vem do cliente (`photo_storage.py` já gera nome próprio — seguir o mesmo
  padrão em qualquer upload novo).
- **XSS**: no React, nunca `dangerouslySetInnerHTML` com dado vindo da API ou do usuário.
- **CORS**: lista explícita de origem em `FRONTEND_ORIGINS`, nunca `allow_origins=["*"]` junto
  com `allow_credentials=True`.
- **Exposição de dado**: mensagem de erro para o cliente nunca inclui stack trace, caminho de
  arquivo do servidor ou detalhe interno; segredo só em `.env` (fora do git, nunca commitado).
- **Negação de serviço**: endpoint pesado (`/ocr/upload`) sempre com limite de tamanho de entrada e
  rate limiting (`slowapi`, já configurado) — qualquer endpoint novo que processe arquivo ou faça
  trabalho pesado (OCR, chamada externa) segue o mesmo padrão.
- **Menor privilégio**: endpoint que só admin deveria chamar depende de `_require_admin`
  (`app/routers/auth.py`), nunca confia em o frontend simplesmente não mostrar o botão.
- **Dependências auditadas**: `bandit -r app`, `pip-audit -r requirements.txt` (backend) e
  `npm audit --audit-level=high` (frontend) fazem parte do `--full` do gate — achado novo bloqueia
  o `code-reviewer`, não é "ignorar e seguir".
- **Nenhum segredo em código, log ou commit** — antes de commitar, `git status`/`git diff`
  revisados (o hook de proteção de arquivos, Fase 6, também bloqueia leitura/escrita de `.env` e
  segredo pelo próprio Claude).
