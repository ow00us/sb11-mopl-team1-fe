/**
 * API Client Configuration
 *
 * Centralized Axios-based HTTP client with:
 * - Automatic JWT token injection
 * - CSRF token handling
 * - Automatic token refresh on 401
 * - Standardized error handling
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ErrorResponse } from '@/lib/types';
import useAuthStore from "@/lib/stores/useAuthStore.ts";
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
  withCredentials: true, // Required for cookie-based CSRF and refresh tokens
});

/**
 * Token getter functions - to be set by auth store
 * This pattern avoids circular dependencies
 */
let getAccessToken: (() => string | null) | null = null;
let getCsrfToken: (() => string | null) | null = null;
let handleTokenRefresh: (() => Promise<string>) | null = null;

export const setTokenGetters = (
  accessTokenGetter: () => string | null,
  csrfTokenGetter: () => string | null,
  refreshHandler: () => Promise<string>,
) => {
  getAccessToken = accessTokenGetter;
  getCsrfToken = csrfTokenGetter;
  handleTokenRefresh = refreshHandler;
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
      if (token && !config.url?.includes('/auth/refresh')) {
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
 * Track if we're currently refreshing token to prevent multiple simultaneous refreshes
 */
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

/**
 * Response Interceptor
 * - Handles 401 errors with automatic token refresh
 * - Transforms error responses to standardized format
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ErrorResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 errors (unauthorized)
    if (
        error.response?.status === 401
        && !error.config?.url?.includes('/auth/')
        && !originalRequest._retry
        && handleTokenRefresh
    ) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await handleTokenRefresh();
        isRefreshing = false;
        onRefreshed(newToken);

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        await useAuthStore.getState().signOut();
        // Token refresh failed - user needs to re-authenticate
        return Promise.reject(refreshError);
      }
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
