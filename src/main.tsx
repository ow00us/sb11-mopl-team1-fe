import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initializeApiClient } from '@/lib/api/init'
import { getCsrfToken } from '@/lib/api/auth'

// Initialize API client with auth store integration
initializeApiClient()

const root = createRoot(document.getElementById('root')!)

const renderApp = () => {
  root.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
}

const bootstrap = async () => {
  try {
    // 깨끗한 브라우저에서도 첫 상태 변경 요청 전에 XSRF-TOKEN 쿠키를 준비합니다.
    await getCsrfToken()
  } catch (error) {
    // 백엔드가 잠시 내려가 있어도 화면은 열되, 이후 요청은 원래 오류를 표시합니다.
    console.error('CSRF token bootstrap failed:', error)
  }

  renderApp()
}

void bootstrap()
