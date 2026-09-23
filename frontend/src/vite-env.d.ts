/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Prefixo das chamadas ao backend (padrão: /api, repassado pelo proxy do Vite). */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
