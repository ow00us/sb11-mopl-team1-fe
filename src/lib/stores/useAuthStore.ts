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
