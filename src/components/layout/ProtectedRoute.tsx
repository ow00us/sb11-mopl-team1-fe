import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/lib/stores/useAuthStore';

/**
 * ProtectedRoute - 인증이 필요한 라우트를 보호
 * 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
 * 액세스 토큰은 메모리에만 보관하므로 새로고침 후에는 다시 로그인합니다.
 */
export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  return isAuthenticated ? <Outlet /> : <Navigate to="/sign-in" replace />;
}
