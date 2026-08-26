import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import {
  clearOAuthAccountLinkReturnTarget,
  consumeOAuthAccountLinkReturnPath,
} from '@/lib/oauth/accountLinkReturn';

type CallbackStatus = 'RESTORING' | 'FAILED';

/**
 * OAuth Provider 인증 성공 후 MOPL 인증 상태를 확정하는 화면입니다.
 *
 * 백엔드는 Refresh Token을 HttpOnly Cookie로 설정한 뒤 이 화면으로
 * Redirect합니다. Access Token은 앱 부팅 과정의 restoreSession()이 발급받으며,
 * 이 컴포넌트는 같은 재발급 요청을 중복 실행하지 않고 그 결과만 기다립니다.
 */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const [status, setStatus] = useState<CallbackStatus>('RESTORING');
  const hasHandledResult = useRef(false);

  useEffect(() => {
    if (!isInitialized || hasHandledResult.current) return;

    hasHandledResult.current = true;

    if (isAuthenticated) {
      const accountLinkReturnPath = consumeOAuthAccountLinkReturnPath();
      navigate(accountLinkReturnPath || '/contents', { replace: true });
      return;
    }

    clearOAuthAccountLinkReturnTarget();
    setStatus('FAILED');
  }, [isAuthenticated, isInitialized, navigate]);

  if (status === 'FAILED') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <section className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-gray-800 bg-gray-950/50 px-8 py-10 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-header1-sb text-gray-200">
              소셜 로그인을 완료하지 못했습니다
            </h1>
            <p className="text-body2-m text-gray-500">
              인증 정보가 만료되었거나 로그인 세션을 생성할 수 없습니다.
              다시 시도해주세요.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => navigate('/sign-in', { replace: true })}
            className="h-[54px] w-full rounded-xl bg-pink-500 text-body1-b text-white hover:bg-pink-600"
          >
            로그인 화면으로 돌아가기
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background"
      aria-label="소셜 로그인 처리 중"
    >
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <h1 className="text-header1-sb text-gray-200">
          소셜 로그인을 완료하고 있습니다
        </h1>
        <p className="mt-2 text-body2-m text-gray-500">
          잠시만 기다려주세요.
        </p>
      </div>
    </main>
  );
}
