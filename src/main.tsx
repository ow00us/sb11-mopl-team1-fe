import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { initializeApiClient } from '@/lib/api/init';
import { getCsrfToken } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/stores/useAuthStore';

/*
 * Axios 요청 인터셉터가 Zustand 인증 저장소에서 Access Token을
 * 가져올 수 있도록 애플리케이션 렌더링 전에 연결합니다.
 *
 * 인증 복원 요청도 apiClient를 사용하므로 restoreSession()보다
 * 반드시 먼저 실행되어야 합니다.
 */
initializeApiClient();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('애플리케이션을 렌더링할 root 요소를 찾을 수 없습니다.');
}

const root = createRoot(rootElement);

/**
 * React 애플리케이션을 실제 DOM에 렌더링합니다.
 */
const renderApp = () => {
  root.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
};

/**
 * 애플리케이션 최초 실행에 필요한 인증 환경을 준비합니다.
 *
 * 실행 순서:
 *
 * 1. 상태 변경 요청에 필요한 CSRF Token을 발급받습니다.
 * 2. HttpOnly Refresh Token Cookie를 이용해 인증 상태를 복원합니다.
 * 3. 인증 복원 시도가 끝난 뒤 React 애플리케이션을 렌더링합니다.
 *
 * Refresh Token 원문은 HttpOnly Cookie이므로 JavaScript에서 직접
 * 읽지 않습니다. 브라우저가 withCredentials 요청에 자동으로 포함합니다.
 */
const bootstrap = async () => {
  try {
    /*
     * POST /api/auth/refresh도 CSRF 보호 대상이므로
     * 재발급 요청보다 CSRF Token 발급이 먼저 실행되어야 합니다.
     */
    await getCsrfToken();
  } catch (error) {
    /*
     * 기존 XSRF-TOKEN Cookie가 남아 있다면 이후 복원 요청이 성공할
     * 가능성이 있으므로 CSRF 발급 실패만으로 부팅을 중단하지 않습니다.
     *
     * 백엔드가 내려가 있는 경우에도 최소한 로그인 화면은 렌더링되어야 합니다.
     */
    console.error('CSRF token bootstrap failed:', error);
  }

  /*
   * Refresh Token Cookie가 존재하면 새로운 Access Token과 사용자 정보를
   * 받아 Zustand 메모리에 저장합니다.
   *
   * Cookie가 없거나 만료된 경우 restoreSession()은 false를 반환하고
   * 비로그인 상태로 초기화를 마칩니다.
   */
  await useAuthStore.getState().restoreSession();

  /*
   * 인증 여부가 확정된 이후 화면을 렌더링합니다.
   *
   * 이를 먼저 렌더링하면 ProtectedRoute가 아직 복원되지 않은 data=null을
   * 비로그인으로 오해하여 로그인 페이지로 이동시키는 화면 깜빡임이 발생합니다.
   */
  renderApp();
};

void bootstrap();