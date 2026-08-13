import { Client, type IFrame, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { create } from 'zustand';
import type { ErrorResponse } from '@/lib/types';
import { toAbsoluteApiUrl } from '@/lib/config/env';
import { isPermanentFailure, isUnauthorized, parseStompErrorFrame } from '@/lib/realtime/stompError';
import useAuthStore from '@/lib/stores/useAuthStore';

interface WebSocketState {
  stompClient: Client | null;
  isConnected: boolean;
  isConnecting: boolean;
  subscriptions: Map<string, StompSubscription>;

  /** 마지막 ERROR 프레임입니다. 연결이 정상화되면 비워집니다. */
  lastError: ErrorResponse | null;
  /** 재연결로는 해소되지 않아 중단한 상태입니다. */
  isBlocked: boolean;

  connect: (accessToken: string) => Promise<void>;
  disconnect: () => void;
  subscribe: <T>(destination: string, callback: (message: T) => void) => void;
  unsubscribe: (destination: string) => void;
  send: (destination: string, body: unknown) => void;
}

/**
 * 구독 생명주기를 개발 환경에서만 기록합니다.
 *
 * 시청 세션 잔존 문제는 SUBSCRIBE 와 UNSUBSCRIBE 의 STOMP id 가 짝을 이루는지로
 * 판별합니다. 프레임을 하나씩 펼쳐 보지 않고도 확인할 수 있게 남깁니다.
 */
const logSubscriptionFrame = (frame: 'SUBSCRIBE' | 'UNSUBSCRIBE', destination: string, id: string) => {
  if (import.meta.env.DEV) {
    console.debug(`[stomp] ${frame} id=${id} ${destination}`);
  }
};

export const useWebSocketStore = create<WebSocketState>((set, get) => {
  /**
   * 진행 중인 연결입니다.
   *
   * 여러 화면이 동시에 connect 를 호출해도 같은 handshake 를 함께 기다리게 합니다.
   * 연결이 끝나거나 실패하면 다시 null 이 됩니다.
   */
  let pendingConnect: Promise<void> | null = null;

  /**
   * 아직 연결이 끝나지 않은 클라이언트입니다.
   *
   * stompClient 는 onConnect 에서야 state 에 들어가므로, handshake 중에 disconnect
   * 되면 state 만 보고는 이 인스턴스를 정리할 수 없습니다. 남겨두면 나중에 연결이
   * 완료되어 주인 없는 구독과 시청 세션이 생깁니다.
   */
  let pendingClient: Client | null = null;

  /**
   * 화면이 요청해 둔 구독입니다. 실제 STOMP 구독과 별개로 유지합니다.
   *
   * 소켓이 닫히면 서버는 구독이 없는 새 STOMP 세션을 만들므로 살아 있는 구독
   * 객체는 버려야 하지만, "무엇을 구독하고 싶은지" 는 남아 있어야 재연결 후
   * 되살릴 수 있습니다. 화면은 재구독 시점을 알 수 없습니다. 구독 effect 는
   * contentId·accessToken 이 바뀔 때만 다시 실행되는데, 재연결은 그 어느 것도
   * 바꾸지 않기 때문입니다.
   */
  const desiredSubscriptions = new Map<string, (body: string) => void>();

  /** 요청해 둔 구독을 현재 연결에 실제로 건다. */
  const openSubscription = (client: Client, destination: string, handler: (body: string) => void) => {
    const subscription = client.subscribe(destination, (message) => handler(message.body));
    logSubscriptionFrame('SUBSCRIBE', destination, subscription.id);
    return subscription;
  };

  /**
   * 재연결을 멈추고 사유를 남깁니다.
   *
   * 403·404 처럼 같은 요청을 반복해도 결과가 같은 경우에 씁니다. deactivate 하지
   * 않으면 stompjs 가 reconnectDelay 마다 같은 실패를 되풀이합니다.
   */
  const block = (client: Client, error: ErrorResponse) => {
    void client.deactivate();
    pendingConnect = null;
    pendingClient = null;
    // 재연결로 해소되지 않는 상태이므로 요청해 둔 구독도 버립니다.
    desiredSubscriptions.clear();
    set({
      stompClient: null,
      isConnected: false,
      isConnecting: false,
      subscriptions: new Map(),
      lastError: error,
      isBlocked: true,
    });
  };

  return {
    stompClient: null,
    isConnected: false,
    isConnecting: false,
    subscriptions: new Map(),
    lastError: null,
    isBlocked: false,

    connect: (accessToken: string) => {
      if (get().isConnected) return Promise.resolve();

      // 연결 중이면 같은 handshake 를 기다립니다. 곧바로 resolve 하면 호출부가
      // 아직 연결되지 않은 클라이언트에 subscribe 를 걸고, subscribe 는
      // isConnected 가 false 라 조용히 반환해 구독이 유실됩니다.
      if (pendingConnect) return pendingConnect;

      set({ isConnecting: true, lastError: null, isBlocked: false });

      const client = new Client({
        // 매번 새 SockJS 를 만들어야 합니다. 닫힌 소켓은 재사용할 수 없어서
        // 인스턴스를 고정하면 재연결이 첫 시도에서 끊깁니다.
        webSocketFactory: () => new SockJS(toAbsoluteApiUrl('/ws')),
        connectHeaders: {
          Authorization: `Bearer ${accessToken}`,
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      pendingClient = client;

      // 재연결 시점의 토큰을 다시 읽습니다. connectHeaders 를 만들 때 잡아둔 토큰은
      // 그 사이 갱신되었더라도 그대로 남아 있어, 만료 후에는 계속 401 을 받습니다.
      client.beforeConnect = () => {
        const currentToken = useAuthStore.getState().getAccessToken() ?? accessToken;
        client.connectHeaders = { Authorization: `Bearer ${currentToken}` };
      };

      pendingConnect = new Promise<void>((resolve, reject) => {
        client.onConnect = () => {
          set({
            stompClient: client,
            isConnected: true,
            isConnecting: false,
            lastError: null,
            isBlocked: false,
          });

          // 끊기기 전에 걸어둔 구독을 되살립니다. 첫 연결이면 목록이 비어 있어
          // 아무 일도 일어나지 않고, 재연결이면 여기서 SUBSCRIBE 가 다시 나갑니다.
          if (desiredSubscriptions.size > 0) {
            const restored = new Map<string, StompSubscription>();
            desiredSubscriptions.forEach((handler, destination) => {
              restored.set(destination, openSubscription(client, destination, handler));
            });
            set({ subscriptions: restored });
          }

          resolve();
        };

        client.onStompError = (frame: IFrame) => {
          const error = parseStompErrorFrame(frame);

          if (isPermanentFailure(error)) {
            // 사용자에게는 화면이 isBlocked 를 읽어 알립니다. toast 로 띄우면
            // 재연결이 불가능한 상태인데도 안내가 사라져, 남은 화면만으로는
            // 왜 동작하지 않는지 알 수 없습니다.
            console.debug('[stomp] 영구 실패로 재연결을 중단합니다:', error);
            block(client, error);
            reject(error);
            return;
          }

          if (isUnauthorized(error)) {
            // 인증 실패는 재연결로 해소되지 않습니다. 로컬 인증 상태를 지워
            // 화면이 재로그인을 요구하게 합니다.
            console.debug('[stomp] 인증 실패로 재연결을 중단합니다:', error);
            block(client, error);
            useAuthStore.getState().clear();
            reject(error);
            return;
          }

          // 그 밖의 오류는 일시적일 수 있어 stompjs 의 자동 재연결에 맡깁니다.
          // 재연결 과정은 사용자에게 알리지 않고 로그로만 남깁니다.
          console.debug('[stomp] 일시 오류. 자동 재연결에 맡깁니다:', error);
          set({ isConnected: false, isConnecting: false, lastError: error });
        };

        client.onWebSocketClose = () => {
          if (get().isBlocked) return;
          // 재연결하면 서버는 구독이 없는 새 STOMP 세션을 만듭니다. Map 을 비우지
          // 않으면 화면이 다시 subscribe 해도 이미 구독 중으로 보고 건너뛰어,
          // 연결은 되었는데 메시지가 오지 않는 상태가 됩니다.
          set({ isConnected: false, isConnecting: false, subscriptions: new Map() });
        };

        client.activate();
      }).finally(() => {
        pendingConnect = null;
        pendingClient = null;
      });

      return pendingConnect;
    },

    disconnect: () => {
      const { stompClient } = get();
      if (stompClient) {
        void stompClient.deactivate();
      }
      if (pendingClient && pendingClient !== stompClient) {
        void pendingClient.deactivate();
      }
      pendingConnect = null;
      pendingClient = null;
      // 명시적 종료이므로 요청해 둔 구독도 버립니다. 남겨두면 다음 로그인에서
      // 화면이 요청하지도 않은 구독이 되살아납니다.
      desiredSubscriptions.clear();
      set({
        stompClient: null,
        isConnected: false,
        isConnecting: false,
        subscriptions: new Map(),
        lastError: null,
        isBlocked: false,
      });
    },

    subscribe: <T,>(destination: string, callback: (message: T) => void) => {
      const { stompClient, isConnected, subscriptions } = get();

      if (subscriptions.has(destination)) return;

      // 연결 여부와 무관하게 요청은 기억해 둡니다. 연결 전에 호출되었더라도
      // onConnect 가 이 목록을 보고 구독을 겁니다.
      const handler = (body: string) => callback(JSON.parse(body) as T);
      desiredSubscriptions.set(destination, handler);

      if (!isConnected || stompClient == null) return;

      const next = new Map(subscriptions);
      next.set(destination, openSubscription(stompClient, destination, handler));
      set({ subscriptions: next });
    },

    unsubscribe: (destination: string) => {
      const { subscriptions } = get();

      // 살아 있는 구독이 없어도 요청은 지웁니다. 끊긴 동안 화면을 벗어나면
      // 구독 객체는 이미 버려졌는데 요청만 남아, 재연결 때 되살아납니다.
      desiredSubscriptions.delete(destination);

      const subscription = subscriptions.get(destination);
      if (!subscription) return;

      subscription.unsubscribe();

      logSubscriptionFrame('UNSUBSCRIBE', destination, subscription.id);

      const next = new Map(subscriptions);
      next.delete(destination);
      set({ subscriptions: next });
    },

    send: (destination: string, body: unknown) => {
      const { stompClient, isConnected } = get();

      if (stompClient && isConnected) {
        stompClient.publish({
          destination,
          body: JSON.stringify(body),
        });
      } else {
        console.error('WebSocket이 연결되어 있지 않습니다.');
      }
    },
  };
});
