/**
 * API Client Configuration
 *
 * Centralized Axios-based HTTP client with:
 * - Automatic JWT token injection
 * - CSRF token handling
 * - Local session cleanup on 401
 * - Standardized error handling
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ErrorResponse } from '@/lib/types';
import { API_BASE_URL } from '@/lib/config/env';

/**
 * Base API client instance
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for the CSRF cookie
});

/**
 * Token getter functions - to be set by auth store
 * This pattern avoids circular dependencies
 */
let getAccessToken: (() => string | null) | null = null;
let getCsrfToken: (() => string | null) | null = null;
let handleUnauthorized: (() => void | Promise<void>) | null = null;

export const setTokenGetters = (
  accessTokenGetter: () => string | null,
  csrfTokenGetter: () => string | null,
  unauthorizedHandler: () => void | Promise<void>,
) => {
  getAccessToken = accessTokenGetter;
  getCsrfToken = csrfTokenGetter;
  handleUnauthorized = unauthorizedHandler;
};

/**
 * Request Interceptor
 * - Injects JWT Bearer token
 * - Injects CSRF token (X-XSRF-TOKEN)
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Inject JWT access token
    if (getAccessToken) {
      const token = getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // Inject CSRF token for non-GET requests
    if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
      if (getCsrfToken) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          config.headers['X-XSRF-TOKEN'] = csrfToken;
        }
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response Interceptor
 * - Clears the local access-token session on 401
 * - Transforms error responses to standardized format
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ErrorResponse>) => {
    if (error.response?.status === 401 && handleUnauthorized) {
      await handleUnauthorized();
    }

    // Transform error to standardized format
    // 응답이 없는 경우(네트워크 오류·타임아웃·CORS)에는 서버 ErrorResponse가 없으므로
    // 클라이언트에서 만들어 채웁니다. 서버 코드(COMMON_*)와 구분되는 값을 씁니다.
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
