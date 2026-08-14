import { useEffect } from 'react';
import { featureFlags } from '@/lib/config/features';
import { useWebSocketStore } from '@/lib/stores/websocketStore';

/** 서버가 시청 세션 만료를 연장하는 주기입니다. */
export const WATCH_HEARTBEAT_INTERVAL_MS = 20_000;

export const watchHeartbeatDestination = (contentId: string) =>
  `/pub/contents/${contentId}/watch/heartbeat`;

/**
 * 시청 중인 콘텐츠의 세션 만료를 주기적으로 연장합니다.
 *
 * 세션 정리는 원래 UNSUBSCRIBE 와 DISCONNECT 로 이뤄집니다. heartbeat 가 메꾸는
 * 것은 두 프레임이 모두 서버에 닿지 못하는 경우입니다. 네트워크가 끊기거나
 * 브라우저가 강제 종료되면 서버는 연결이 죽은 것을 알 수 없고, 만료 시각만이
 * 유일한 정리 수단입니다.
 *
 * 동시에 정상적으로 시청 중인 사용자의 만료 시각도 함께 밀어줍니다. 세션 시작
 * 시점에 한 번만 기록되던 값이라, 오래 시청하면 살아 있는데도 조회·채팅·시청자
 * 목록에서 사라지는 문제가 있었습니다.
 *
 * 구독 effect 와 분리한 이유는 그쪽이 isConnected 를 의존성에서 빼기 때문입니다.
 * 재연결은 구독 effect 를 다시 돌리지 않으므로, 연결 상태를 직접 보는 곳이
 * 따로 있어야 재연결 후 heartbeat 가 되살아납니다.
 */
export function useWatchHeartbeat(contentId: string | undefined) {
  const isConnected = useWebSocketStore((state) => state.isConnected);
  const send = useWebSocketStore((state) => state.send);

  useEffect(() => {
    if (!featureFlags.watchHeartbeat) return;
    if (!contentId || !isConnected) return;

    const destination = watchHeartbeatDestination(contentId);

    // 첫 발송은 주기 뒤입니다. 구독 자체가 입장 신호라 방금 세션이 기록됐습니다.
    //
    // 브라우저는 백그라운드 탭의 타이머를 최소 1분까지 늘립니다. 주기가 20초여도
    // 탭이 뒤에 있으면 그만큼 벌어지므로, 서버 만료 시각은 그 지연을 감당할 만큼
    // 여유가 있어야 합니다.
    const timer = setInterval(() => {
      // 틱과 전송 사이에 연결이 끊길 수 있습니다. 끊긴 상태로 보내면 send 가
      // 콘솔에 오류만 남기므로 상태를 다시 확인합니다.
      if (!useWebSocketStore.getState().isConnected) return;
      send(destination, {});
    }, WATCH_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [contentId, isConnected, send]);
}
