import { create } from 'zustand';
import type { JwtDto } from '@/lib/types';
import {
  getCsrfToken,
  refreshToken as requestRefreshToken,
  signIn as requestSignIn,
} from '@/lib/api/auth';

/**
 * 현재 진행 중인 인증 복원 요청입니다.
 *
 * 여러 컴포넌트나 여러 401 응답이 동시에 restoreSession()을 호출해도
 * Refresh Token 재발급 요청은 한 번만 실행해야 합니다.
 *
 * Refresh Token은 재발급할 때마다 교체되는 Rotation 방식이므로,
 * 같은 Cookie로 여러 재발급 요청을 동시에 보내면 하나를 제외한 나머지는
 * 이미 폐기된 토큰을 사용하게 됩니다.
 *
 * 따라서 진행 중인 Promise를 공유하여 모든 호출자가 같은 결과를
 * 기다리도록 합니다.
 */
let pendingSessionRestore: Promise<boolean> | null = null;

/**
 * 비동기 인증 응답이 오래 걸리는 동안 사용자가 로그아웃하거나
 * 새로운 로그인을 시작했는지 구분하기 위한 세대 번호입니다.
 *
 * 요청을 시작할 때의 번호와 응답 시점의 번호가 다르면 해당 응답은
 * 이미 오래된 응답이므로 인증 상태에 반영하지 않습니다.
 */
let sessionGeneration = 0;

interface AuthStore {
  /** 로그인 사용자 정보와 메모리에 보관하는 Access Token */
  data: JwtDto | null;

  /** 로그인 요청이 진행 중인지 나타냅니다. */
  loading: boolean;

  /** Refresh Token을 이용한 인증 복원이 진행 중인지 나타냅니다. */
  isRestoring: boolean;

  /**
   * 애플리케이션 최초 인증 복원 시도가 끝났는지 나타냅니다.
   *
   * false인 동안에는 사용자가 비로그인 상태라고 확정할 수 없습니다.
   * ProtectedRoute는 이 값이 true가 될 때까지 로그인 화면으로
   * 이동시키지 않고 기다려야 합니다.
   */
  isInitialized: boolean;

  error?: string;

  update: (data: Partial<JwtDto>) => void;
  clear: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  /**
   * HttpOnly Refresh Token Cookie를 이용해 인증 상태를 복원합니다.
   *
   * @returns 복원에 성공하면 true, 유효한 Refresh Token이 없으면 false
   */
  restoreSession: () => Promise<boolean>;

  isAuthenticated: () => boolean;
  getAccessToken: () => string | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  data: null,
  loading: false,
  isRestoring: false,
  isInitialized: false,
  error: undefined,

  update: (newData) => {
    set((state) => ({
      data: state.data ? { ...state.data, ...newData } : null,
    }));
  },

  clear: () => {
    /*
     * 현재 진행 중인 복원 요청보다 세대 번호를 증가시킵니다.
     *
     * 로그아웃 직전에 시작한 재발급 응답이 뒤늦게 도착하더라도
     * 로그인 상태가 다시 살아나지 않도록 합니다.
     */
    sessionGeneration += 1;

    set({
      data: null,
      loading: false,
      isRestoring: false,
      isInitialized: true,
      error: undefined,
    });
  },

  signIn: async (email: string, password: string) => {
    /*
     * 이전에 시작된 인증 복원 응답이 로그인 결과를 덮어쓰지 못하도록
     * 새로운 인증 작업의 세대 번호를 부여합니다.
     */
    sessionGeneration += 1;

    set({
      loading: true,
      error: undefined,
    });

    try {
      const data = await requestSignIn({ email, password });

      set({
        data,
        isInitialized: true,
      });

      /*
       * 로그인 과정에서 서버 세션 상태가 변경됐을 수 있으므로
       * 이후 상태 변경 요청에서 사용할 CSRF Token을 다시 발급받습니다.
       *
       * CSRF 재발급 실패가 로그인 성공 자체를 취소하지는 않습니다.
       */
      try {
        await getCsrfToken();
      } catch (error) {
        console.error('Failed to renew CSRF token after sign-in:', error);
      }
    } catch (error) {
      set({
        error: (error as Error).message || '로그인에 실패했습니다.',
        isInitialized: true,
      });

      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    /*
     * 서버 요청 결과와 관계없이 브라우저 메모리의 Access Token을
     * 먼저 제거하여 로그아웃 직후 보호 API가 호출되지 않게 합니다.
     */
    get().clear();

    try {
      await getCsrfToken();
    } catch (error) {
      console.error('Failed to renew CSRF token after sign-out:', error);
    }
  },

  restoreSession: () => {
    /*
     * 이미 재발급 요청이 진행 중이면 새로운 요청을 만들지 않고
     * 기존 Promise를 반환합니다.
     *
     * 이것이 Refresh Token Rotation 환경에서 동시 재발급 요청을
     * 방지하는 single-flight 처리입니다.
     */
    if (pendingSessionRestore) {
      return pendingSessionRestore;
    }

    const requestedGeneration = sessionGeneration;

    set({
      isRestoring: true,
      error: undefined,
    });

    pendingSessionRestore = (async () => {
      try {
        /*
         * Refresh Token 원문은 HttpOnly Cookie에 있으므로 JavaScript에서
         * 직접 읽지 않습니다.
         *
         * Axios의 withCredentials 설정을 통해 브라우저가 Cookie를
         * POST /api/auth/refresh 요청에 자동으로 포함합니다.
         */
        const data = await requestRefreshToken();

        /*
         * 요청 도중 로그아웃이나 새로운 로그인이 실행됐다면
         * 이 재발급 응답은 오래된 결과이므로 저장하지 않습니다.
         */
        if (requestedGeneration !== sessionGeneration) {
          return false;
        }

        set({
          data,
          error: undefined,
        });

        return true;
      } catch {
        /*
         * Refresh Token Cookie가 없거나 만료·폐기된 경우입니다.
         *
         * 앱 최초 실행 시 비로그인 사용자에게도 자연스럽게 발생할 수
         * 있으므로 일반적인 로그인 오류 메시지로 저장하지 않습니다.
         */
        if (requestedGeneration === sessionGeneration) {
          set({
            data: null,
            error: undefined,
          });
        }

        return false;
      } finally {
        if (requestedGeneration === sessionGeneration) {
          set({
            isRestoring: false,
            isInitialized: true,
          });
        }

        pendingSessionRestore = null;
      }
    })();

    return pendingSessionRestore;
  },

  isAuthenticated: () => {
    const { data } = get();
    return data?.accessToken != null;
  },

  getAccessToken: () => {
    const { data } = get();
    return data?.accessToken || null;
  },
}));

export default useAuthStore;