import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    test: {
      include: ['tests/unit/**/*.test.js'],
    },
    server: {
      // host: true expõe o dev server na rede local, para abrir no celular.
      host: true,
      // O proxy evita configurar CORS no backend durante o desenvolvimento:
      // o navegador chama /api/... e o Vite repassa para o FastAPI.
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
