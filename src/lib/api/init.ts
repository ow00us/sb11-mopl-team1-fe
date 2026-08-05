/**
 * API Client Initialization
 *
 * Connects the API client with the auth store to enable:
 * - Automatic JWT token injection
 * - CSRF token handling
 * - Local authentication and realtime cleanup on 401 errors
 */

import { setTokenGetters } from './client';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { getCsrfTokenFromCookie } from './auth';
import { useSseStore } from '@/lib/stores/sseStore';
import { useWebSocketStore } from '@/lib/stores/websocketStore';

export const clearClientSession = () => {
  useWebSocketStore.getState().disconnect();
  useSseStore.getState().disconnect();
  useAuthStore.getState().clear();
};

/**
 * Initialize API client with auth store integration
 *
 * MUST be called before any API requests are made (typically in main.tsx)
 */
export const initializeApiClient = () => {
  setTokenGetters(
    // Get access token from auth store
    () => useAuthStore.getState().getAccessToken(),

    // Get CSRF token from cookie
    () => getCsrfTokenFromCookie(),

    // Refresh API가 준비되기 전에는 401을 재로그인 경계로 사용합니다.
    () => {
      clearClientSession();

      if (window.location.hash !== '#/sign-in') {
        window.location.replace('#/sign-in');
      }
    },
  );
};
