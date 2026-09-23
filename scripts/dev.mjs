#!/usr/bin/env node
// Sobe o ambiente completo de desenvolvimento com um comando só (`npm run dev` na raiz):
// PostgreSQL (Docker) → migrações → FastAPI (:8002) + Vite (:5173). Ctrl+C encerra tudo.
//
// Sem dependências: só Node, Python 3, Docker e npm precisam estar instalados.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND = join(ROOT, 'backend')
const FRONTEND = join(ROOT, 'frontend')
const IS_WINDOWS = process.platform === 'win32'
const VENV_BIN = join(BACKEND, '.venv', IS_WINDOWS ? 'Scripts' : 'bin')
const VENV_PYTHON = join(VENV_BIN, IS_WINDOWS ? 'python.exe' : 'python')
const FRONTEND_URL = 'http://localhost:5173'
const BACKEND_URL = 'http://localhost:8002'

const COLORS = { db: 34, backend: 32, frontend: 35, dev: 36, error: 31 }
const color = (name, text) => `\x1b[${COLORS[name] ?? 0}m${text}\x1b[0m`
const log = (message) => console.log(`${color('dev', '[dev]')} ${message}`)

function fail(message) {
  console.error(`\x1b[31m[dev] ${message}\x1b[0m`)
  process.exit(1)
}

/** Roda um comando até o fim, mostrando a saída; aborta o script se falhar. */
function run(command, args, { cwd = ROOT, errorMessage } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: IS_WINDOWS })
  if (result.status !== 0) fail(errorMessage ?? `Falhou: ${command} ${args.join(' ')}`)
}

function commandExists(command, args = ['--version']) {
  return spawnSync(command, args, { stdio: 'ignore', shell: IS_WINDOWS }).status === 0
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// --- 1. Banco -------------------------------------------------------------------------------

function startDatabase() {
  if (!commandExists('docker', ['info'])) {
    fail('Docker não está rodando. Abra o Docker Desktop e rode `npm run dev` de novo.')
  }
  log('Subindo o PostgreSQL (docker compose)…')
  run('docker', ['compose', 'up', '-d', '--wait', 'db'], {
    errorMessage: 'O PostgreSQL não subiu. Veja `docker compose logs db`.',
  })
}

// --- 2. Backend -----------------------------------------------------------------------------

function findSystemPython() {
  const candidates = IS_WINDOWS ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]
  for (const [command, prefix] of candidates) {
    if (commandExists(command, [...prefix, '--version'])) return [command, prefix]
  }
  fail('Python 3 não encontrado. Instale em https://www.python.org/downloads/.')
}

function prepareBackend() {
  if (!existsSync(VENV_PYTHON)) {
    log('Criando o ambiente virtual do backend (backend/.venv)…')
    const [python, prefix] = findSystemPython()
    run(python, [...prefix, '-m', 'venv', '.venv'], { cwd: BACKEND })
  }

  // Só reinstala quando o requirements.txt muda (a 1ª instalação do EasyOCR é demorada).
  const requirements = join(BACKEND, 'requirements.txt')
  const stamp = join(BACKEND, '.venv', '.requirements.sha256')
  const hash = fileHash(requirements)
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash) {
    log('Instalando dependências do backend (na 1ª vez pode levar alguns minutos)…')
    run(VENV_PYTHON, ['-m', 'pip', 'install', '-q', '-r', 'requirements.txt'], { cwd: BACKEND })
    writeFileSync(stamp, hash)
  }

  log('Aplicando migrações do banco (alembic upgrade head)…')
  run(VENV_PYTHON, ['-m', 'alembic', 'upgrade', 'head'], { cwd: BACKEND })
}

// --- 3. Frontend ----------------------------------------------------------------------------

function prepareFrontend() {
  const lock = join(FRONTEND, 'package-lock.json')
  const stamp = join(FRONTEND, 'node_modules', '.package-lock.sha256')
  const hash = fileHash(lock)
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash) {
    log('Instalando dependências do frontend (npm ci)…')
    run('npm', ['ci'], { cwd: FRONTEND })
    writeFileSync(stamp, hash)
  }
}

/** Aborta cedo, com mensagem clara, se outra instância (ou outro app) já ocupa a porta. */
async function ensurePortFree(port, name) {
  // Tenta conectar: se alguém atende em localhost, a porta está ocupada.
  const free = await new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(true))
  })
  if (!free) {
    fail(
      `A porta ${port} (${name}) já está em uso — provavelmente outro \`npm run dev\` ainda aberto. ` +
        'Feche-o (Ctrl+C no terminal dele) e tente de novo.',
    )
  }
}

// --- 4. Servidores --------------------------------------------------------------------------

const children = []

function startServer(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, shell: IS_WINDOWS, env: { ...process.env, FORCE_COLOR: '1' } })
  const prefix = color(name, `[${name}]`.padEnd(11))
  const pipe = (stream, target) => {
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop()
      for (const line of lines) target.write(`${prefix}${line}\n`)
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\x1b[31m[dev] ${name} encerrou (código ${code}). Parando o resto…\x1b[0m`)
      shutdown(1)
    }
  })
  children.push(child)
  return child
}

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  log('Encerrando backend e frontend… (o PostgreSQL continua no Docker; `docker compose stop` para parar)')
  for (const child of children) {
    if (child.exitCode !== null) continue
    // No Windows o processo real roda sob o cmd.exe do `shell: true`: mata a árvore inteira.
    if (IS_WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGINT')
  }
  process.exit(exitCode)
}

function openBrowser(url) {
  const [command, args] = IS_WINDOWS
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

// --- Main -----------------------------------------------------------------------------------

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const noBrowser = process.argv.includes('--no-open')

await ensurePortFree(8002, 'backend')
await ensurePortFree(5173, 'frontend')

startDatabase()
prepareBackend()
prepareFrontend()

log('Subindo backend e frontend…')
startServer('backend', VENV_PYTHON, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8002'], BACKEND)
startServer('frontend', 'npm', ['run', 'dev', '--', '--port', '5173', '--strictPort'], FRONTEND)

const [backendUp, frontendUp] = await Promise.all([
  waitFor(`${BACKEND_URL}/health`),
  waitFor(FRONTEND_URL),
])
if (!backendUp || !frontendUp) {
  console.error(color('error', '[dev] Backend ou frontend não respondeu em 60 s. Veja os logs acima.'))
  shutdown(1)
}

console.log(`
${color('dev', '  Ambiente no ar:')}
    App (guarita)   ${FRONTEND_URL}
    API             ${BACKEND_URL}
    Docs da API     ${BACKEND_URL}/docs
    PostgreSQL      localhost:5433 (usuário/senha: ocr/ocr)

  Ctrl+C para encerrar.
`)
if (!noBrowser) openBrowser(FRONTEND_URL)
