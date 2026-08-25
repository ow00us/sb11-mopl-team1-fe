/**
 * API Client Initialization
 *
 * API 클라이언트와 인증·실시간 통신 저장소를 연결합니다.
 */

import { getCsrfTokenFromCookie } from './auth';
import { setTokenGetters } from './client';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { useSseStore } from '@/lib/stores/sseStore';
import { useWebSocketStore } from '@/lib/stores/websocketStore';

/**
 * 브라우저 메모리에 존재하는 인증 및 실시간 연결 상태를 정리합니다.
 *
 * Refresh Token Cookie 자체의 폐기는 백엔드 로그아웃 API의 역할이고,
 * 여기서는 인증 복구에 실패한 클라이언트 상태를 정리합니다.
 */
export const disconnectRealtimeClients = () => {
  useWebSocketStore.getState().disconnect();
  useSseStore.getState().disconnect();
};

export const clearClientSession = () => {
  disconnectRealtimeClients();
  useAuthStore.getState().clear();
};

/**
 * 인증 복구에 실패한 사용자를 로그인 페이지로 이동시킵니다.
 */
const redirectToSignIn = () => {
  if (window.location.hash !== '#/sign-in') {
    window.location.replace('#/sign-in');
  }
};

/**
 * API 클라이언트가 인증 저장소를 사용할 수 있도록 연결합니다.
 *
 * main.tsx에서 어떤 API 요청보다 먼저 한 번 호출해야 합니다.
 */
export const initializeApiClient = () => {
  setTokenGetters(
    /*
     * 일반 보호 API 요청에 넣을 Access Token을 반환합니다.
     */
    () => useAuthStore.getState().getAccessToken(),

    /*
     * 상태 변경 요청에 넣을 CSRF Token을 Cookie에서 읽습니다.
     */
    () => getCsrfTokenFromCookie(),

    /*
     * 보호 API가 401을 반환했을 때 실행됩니다.
     *
     * restoreSession()은 동시 호출을 하나의 재발급 요청으로 합치며,
     * 성공하면 새로운 JwtDto를 Zustand 메모리에 저장합니다.
     */
    async () => {
      const restored =
        await useAuthStore.getState().restoreSession();

      if (restored) {
        return useAuthStore.getState().getAccessToken();
      }

      /*
       * Refresh Token이 없거나 만료·폐기되어 복구할 수 없는 경우에만
       * 인증 상태와 실시간 연결을 정리하고 로그인 페이지로 이동합니다.
       */
      clearClientSession();
      redirectToSignIn();

      return null;
    },
  );
};
