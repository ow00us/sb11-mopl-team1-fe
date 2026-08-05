import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 개발 서버가 백엔드로 넘기는 경로입니다. 이 목록 덕분에 VITE_API_BASE_URL 을
// 비워 두고 상대 경로로 요청할 수 있습니다.
const PROXY_TARGET = 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    // 앱을 서브 경로에 배포할 때 정적 자산 URL 의 접두사입니다.
    // 값이 없으면 루트 배포로 봅니다.
    base: env.VITE_PUBLIC_PATH || '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: PROXY_TARGET,
          changeOrigin: true,
        },
        '/oauth2': {
          target: PROXY_TARGET,
          changeOrigin: true,
        },
        '/ws': {
          target: PROXY_TARGET.replace(/^http/, 'ws'),
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
