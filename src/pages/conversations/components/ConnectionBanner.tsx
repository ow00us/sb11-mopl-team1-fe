import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { useWebSocketStore } from '@/lib/stores/websocketStore';

/**
 * 실시간 연결이 최종적으로 끊어졌을 때만 입력창 위에 안내를 띄웁니다.
 *
 * 자동 재연결 중에는 아무것도 보여주지 않습니다. 일시적인 네트워크 흔들림까지
 * 노출하면 화면이 계속 깜빡이고, 사용자가 할 수 있는 일도 없습니다.
 * 연결이 복구되면 isBlocked 가 false 로 돌아가 이 안내는 저절로 사라집니다.
 */
export default function ConnectionBanner() {
  const isBlocked = useWebSocketStore((state) => state.isBlocked);
  const connect = useWebSocketStore((state) => state.connect);
  const accessToken = useAuthStore((state) => state.data?.accessToken);
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isBlocked) return null;

  const handleRetry = async () => {
    if (!accessToken) return;

    setIsRetrying(true);
    try {
      // connect 는 시작할 때 isBlocked 를 내리므로 성공하면 이 안내가 사라지고,
      // 화면의 구독 effect 가 isConnected 변화를 보고 다시 구독합니다.
      await connect(accessToken);
    } catch {
      // 같은 이유로 다시 막히면 isBlocked 가 유지되어 안내가 그대로 남습니다.
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      role="status"
      className="mx-[30px] flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-red-notification/40 bg-red-notification/10 px-4 py-3"
    >
      <p className="text-body3-m text-gray-200">
        연결이 끊어졌습니다. 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={handleRetry}
        disabled={isRetrying || !accessToken}
        className="shrink-0 rounded-lg bg-gray-800 px-3 py-1.5 text-body3-sb text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        {isRetrying ? '연결 중...' : '다시 연결'}
      </button>
    </div>
  );
}
