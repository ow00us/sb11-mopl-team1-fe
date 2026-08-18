import { Navigate, Outlet } from 'react-router-dom';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuthStore } from '@/lib/stores/useAuthStore';

/**
 * 인증이 필요한 하위 라우트를 보호합니다.
 *
 * 인증 상태가 아직 초기화되지 않았다면 결과가 확정될 때까지 대기하고,
 * 초기화 이후 Access Token이 없으면 로그인 페이지로 이동시킵니다.
 */
export default function ProtectedRoute() {
  /*
   * 앱 최초 실행 후 Refresh Token을 확인했는지 나타냅니다.
   *
   * data가 null이라는 사실만으로는 비로그인 상태인지,
   * 아직 인증 복원을 시도하지 않은 상태인지 구분할 수 없습니다.
   */
  const isInitialized = useAuthStore((state) => state.isInitialized);

  /*
   * Access Token이 메모리에 존재하는지 확인합니다.
   *
   * Refresh Token 원문은 HttpOnly Cookie이므로 이 컴포넌트에서
   * 직접 조회하거나 로그인 여부 판단에 사용하지 않습니다.
   */
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  /*
   * 인증 복원 결과가 확정되기 전에는 로그인 페이지로 이동하지 않습니다.
   *
   * 이 처리가 없으면 새로고침 직후 data가 잠시 null인 상태를 비로그인으로
   * 판단하여 로그인 페이지로 이동했다가 다시 보호 화면으로 돌아오는
   * 리다이렉트 깜빡임이 발생할 수 있습니다.
   */
  if (!isInitialized) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        aria-label="인증 상태 확인 중"
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  /*
   * 인증 복원이 끝났지만 Access Token이 없다면
   * 실제 비로그인 사용자로 확정하고 로그인 페이지로 이동합니다.
   */
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  /*
   * 인증된 사용자는 ProtectedRoute 아래에 구성된 실제 페이지를 렌더링합니다.
   */
  return <Outlet />;
}