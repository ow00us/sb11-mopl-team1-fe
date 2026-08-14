import { create } from 'zustand';
import type { JwtDto } from '@/lib/types';
import { getCsrfToken, signIn as requestSignIn } from '@/lib/api/auth';

interface AuthStore {
  data: JwtDto | null;
  loading: boolean;
  error?: string;
  update: (data: Partial<JwtDto>) => void;
  clear: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: () => boolean;
  getAccessToken: () => string | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  data: null,
  loading: false,
  error: undefined,

  update: (newData) => {
    set((state) => ({
      data: state.data ? { ...state.data, ...newData } : null,
    }));
  },

  clear: () => {
    set({ data: null, loading: false, error: undefined });
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: undefined });

    try {
      const data = await requestSignIn({ email, password });
      set({ data });

      // 로그인 경계를 넘으면 부트스트랩에서 받아둔 CSRF 토큰이 서버가 보관한 값과
      // 어긋날 수 있습니다. 그대로 두면 로그인 직후 첫 상태 변경 요청만
      // 403 MissingCsrfTokenException 으로 실패하고 재시도는 성공합니다.
      // 재발급 실패가 로그인 자체를 되돌리지는 않도록 signOut 과 같게 처리합니다.
      try {
        await getCsrfToken();
      } catch (error) {
        console.error('Failed to renew CSRF token after sign-in:', error);
      }
    } catch (error) {
      set({ error: (error as Error).message || '로그인에 실패했습니다.' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    // 서버 sign-out API가 준비되기 전에는 액세스 토큰을 로컬에서 즉시 폐기합니다.
    get().clear();

    try {
      await getCsrfToken();
    } catch (error) {
      console.error('Failed to renew CSRF token after sign-out:', error);
    }
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
