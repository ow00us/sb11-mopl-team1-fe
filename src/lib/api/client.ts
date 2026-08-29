/**
 * API Client Configuration
 *
 * 중앙 Axios 클라이언트가 다음 기능을 담당합니다.
 *
 * - Access Token 자동 주입
 * - CSRF Token 자동 주입
 * - 401 응답 시 Access Token 재발급
 * - 재발급 성공 후 원래 요청 1회 재시도
 * - 공통 오류 응답 형식 처리
 */

import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ErrorResponse } from '@/lib/types';
import { API_BASE_URL } from '@/lib/config/env';

/**
 * 401 응답을 받은 요청에 재시도 여부를 기록하기 위한 설정 타입입니다.
 *
 * 같은 요청이 재시도 이후에도 다시 401을 받았을 때 재발급을 반복하면
 * 무한 반복이 발생하므로 _retry 플래그로 한 번만 허용합니다.
 */
type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

/**
 * Access Token을 요청 헤더에 포함하지 않을 인증 API 경로입니다.
 *
 * 특히 /api/auth/refresh 요청에 만료된 Access Token을 넣으면
 * 백엔드 JWT 필터가 Cookie를 확인하기 전에 요청을 거부할 수 있습니다.
 */
const ACCESS_TOKEN_EXCLUDED_PATHS = new Set([
  '/api/auth/sign-in',
  '/api/auth/refresh',
  '/api/auth/reset-password',
  '/api/auth/csrf-token',
]);

/**
 * 401 자동 복구를 시도하지 않을 경로입니다.
 *
 * 로그인 실패에 대해 기존 Refresh Token으로 인증을 복원하면
 * 사용자가 입력한 계정과 기존 Cookie 계정이 섞일 수 있습니다.
 *
 * 재발급 API 자체의 실패를 다시 재발급으로 복구하려 하면
 * 무한 재귀가 발생하므로 반드시 제외해야 합니다.
 */
const AUTH_RECOVERY_EXCLUDED_PATHS = new Set([
  '/api/auth/sign-in',
  '/api/auth/refresh',
]);

/**
 * URL에서 쿼리 문자열을 제외한 API 경로를 반환합니다.
 */
const getRequestPath = (config: InternalAxiosRequestConfig): string => {
  return config.url?.split('?')[0] ?? '';
};

/**
 * Base API client instance
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  withXSRFToken: true,
  headers: {
    'Content-Type': 'application/json',
  },

  /*
   * Refresh Token과 CSRF Token이 Cookie에 저장되므로
   * 브라우저가 API 요청에 Cookie를 포함하도록 설정합니다.
   */
  withCredentials: true,
});

/**
 * 인증 저장소와 API 클라이언트의 순환 참조를 피하기 위한 함수 참조입니다.
 *
 * client.ts가 Zustand 저장소를 직접 import하지 않고,
 * 애플리케이션 초기화 시 init.ts에서 필요한 함수를 전달합니다.
 */
let getAccessToken: (() => string | null) | null = null;
let getCsrfToken: (() => string | null) | null = null;

/**
 * 401 응답을 복구하고 새 Access Token을 반환하는 함수입니다.
 *
 * 복구에 성공하면 새 Access Token을 반환하고,
 * 복구할 수 없으면 null을 반환합니다.
 */
let handleUnauthorized: (() => Promise<string | null>) | null = null;

export const setTokenGetters = (
  accessTokenGetter: () => string | null,
  csrfTokenGetter: () => string | null,
  unauthorizedHandler: () => Promise<string | null>,
) => {
  getAccessToken = accessTokenGetter;
  getCsrfToken = csrfTokenGetter;
  handleUnauthorized = unauthorizedHandler;
};

/**
 * Request Interceptor
 *
 * - 보호 API에 JWT Access Token을 주입합니다.
 * - 상태 변경 요청에 CSRF Token을 주입합니다.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestPath = getRequestPath(config);

    /*
     * Refresh API에는 현재 Access Token을 넣지 않습니다.
     *
     * 401을 발생시킨 기존 Access Token은 만료되었을 가능성이 높습니다.
     * 이 값을 재발급 요청에 다시 넣으면 Refresh Token Cookie가
     * 유효하더라도 JWT 필터에서 먼저 거부될 수 있습니다.
     */
    if (ACCESS_TOKEN_EXCLUDED_PATHS.has(requestPath)) {
      config.headers.delete('Authorization');
    } else if (getAccessToken) {
      const token = getAccessToken();

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    /*
     * GET, HEAD, OPTIONS를 제외한 상태 변경 요청에는
     * XSRF-TOKEN Cookie의 값을 X-XSRF-TOKEN 헤더로 전달합니다.
     */
    if (
      config.method
      && !['get', 'head', 'options'].includes(config.method.toLowerCase())
      && getCsrfToken
    ) {
      const csrfToken = getCsrfToken();

      if (csrfToken) {
        config.headers['X-XSRF-TOKEN'] = csrfToken;
      }
    }

    return config;
  },
  (error: unknown) => {
    return Promise.reject(error);
  },
);

/**
 * Response Interceptor
 *
 * 보호 API가 401을 반환하면 다음 순서로 처리합니다.
 *
 * 1. Refresh Token으로 새 Access Token을 발급받습니다.
 * 2. 원래 요청의 Authorization 헤더를 새 토큰으로 교체합니다.
 * 3. 원래 요청을 한 번만 다시 전송합니다.
 * 4. 재발급에 실패하면 원래 401 응답을 호출부에 전달합니다.
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },

  async (error: AxiosError<ErrorResponse>) => {
    const originalRequest =
      error.config as RetriableRequestConfig | undefined;

    const requestPath = originalRequest
  ? getRequestPath(originalRequest)
  : '';

/*
 * 모듈 변수의 현재 함수 참조를 지역 상수로 고정합니다.
 *
 * TypeScript는 모듈 변수인 handleUnauthorized가 비동기 처리 사이에
 * null로 변경될 가능성이 있다고 판단할 수 있습니다.
 * 지역 상수로 복사하면 아래 null 검사 이후 안전하게 호출할 수 있습니다.
 */
const unauthorizedHandler = handleUnauthorized;

const canAttemptRecovery =
  error.response?.status === 401
  && originalRequest != null
  && originalRequest._retry !== true
  && !AUTH_RECOVERY_EXCLUDED_PATHS.has(requestPath)
  && unauthorizedHandler != null;

    if (canAttemptRecovery) {
      /*
       * 재시도 전에 먼저 표시합니다.
       *
       * 재시도한 요청도 401을 반환하면 이 플래그가 true이므로
       * 재발급을 다시 시도하지 않고 최종 실패로 처리합니다.
       */
      originalRequest._retry = true;

      try {
        /*
         * 여러 요청에서 동시에 401이 발생하더라도 useAuthStore의
         * single-flight 처리로 실제 재발급 요청은 한 번만 실행됩니다.
         */
        const newAccessToken = await unauthorizedHandler();

        if (newAccessToken) {
          /*
           * 만료된 기존 Authorization 헤더를 새 Access Token으로 교체한 뒤
           * 동일한 Axios 요청 설정을 이용해 원래 요청을 다시 보냅니다.
           */
          originalRequest.headers.Authorization =
            `Bearer ${newAccessToken}`;

          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        /*
         * 인증 복구 실패가 원래 API 오류를 다른 예외로 덮어쓰지 않도록
         * 개발 환경 로그만 남기고 아래에서 원래 오류를 반환합니다.
         */
        console.error(
          'Access Token refresh after 401 failed:',
          refreshError,
        );
      }
    }

    /*
     * 서버 응답 자체가 없는 네트워크 오류·타임아웃·CORS 오류에는
     * 클라이언트 전용 오류 응답을 생성합니다.
     */
    const errorResponse: ErrorResponse = error.response?.data || {
      exceptionName: error.name,
      message: error.message,
      details: {},
      errorCode: 'CLIENT_NETWORK_ERROR',
    };

    if (error.response) {
      error.response.data = errorResponse;
    }

    return Promise.reject(error);
  },
);

export default apiClient;
