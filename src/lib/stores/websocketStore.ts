import { Client, type IFrame, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { toast } from 'sonner';
import { create } from 'zustand';
import type { ErrorResponse } from '@/lib/types';
import { API_BASE_URL } from '@/lib/config/env';
import { isForbidden, isUnauthorized, parseStompErrorFrame } from '@/lib/realtime/stompError';
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

export const useWebSocketStore = create<WebSocketState>((set, get) => {
  /**
   * 재연결을 멈추고 사유를 남깁니다.
   *
   * 403·404 처럼 같은 요청을 반복해도 결과가 같은 경우에 씁니다. deactivate 하지
   * 않으면 stompjs 가 reconnectDelay 마다 같은 실패를 되풀이합니다.
   */
  const block = (client: Client, error: ErrorResponse) => {
    void client.deactivate();
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
      const { isConnected, isConnecting } = get();
      if (isConnected || isConnecting) return Promise.resolve();

      set({ isConnecting: true, lastError: null, isBlocked: false });

      const client = new Client({
        // 매번 새 SockJS 를 만들어야 합니다. 닫힌 소켓은 재사용할 수 없어서
        // 인스턴스를 고정하면 재연결이 첫 시도에서 끊깁니다.
        webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
        connectHeaders: {
          Authorization: `Bearer ${accessToken}`,
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      // 재연결 시점의 토큰을 다시 읽습니다. connectHeaders 를 만들 때 잡아둔 토큰은
      // 그 사이 갱신되었더라도 그대로 남아 있어, 만료 후에는 계속 401 을 받습니다.
      client.beforeConnect = () => {
        const currentToken = useAuthStore.getState().getAccessToken() ?? accessToken;
        client.connectHeaders = { Authorization: `Bearer ${currentToken}` };
      };

      return new Promise<void>((resolve, reject) => {
        client.onConnect = () => {
          set({
            stompClient: client,
            isConnected: true,
            isConnecting: false,
            lastError: null,
            isBlocked: false,
          });
          resolve();
        };

        client.onStompError = (frame: IFrame) => {
          const error = parseStompErrorFrame(frame);

          if (isPermanentFailure(error)) {
            block(client, error);
            toast.error(error.message);
            reject(error);
            return;
          }

          if (isUnauthorized(error)) {
            // 토큰 재발급 API 가 아직 없으므로 재연결로 해소할 방법이 없습니다.
            // 로컬 인증 상태를 지워 화면이 재로그인을 요구하게 합니다.
            block(client, error);
            useAuthStore.getState().clear();
            toast.error('실시간 연결 인증에 실패했습니다. 다시 로그인해 주세요.');
            reject(error);
            return;
          }

          // 그 밖의 오류는 일시적일 수 있어 stompjs 의 자동 재연결에 맡깁니다.
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
      });
    },

    disconnect: () => {
      const { stompClient } = get();
      if (stompClient) {
        void stompClient.deactivate();
      }
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

      if (subscriptions.has(destination) || !isConnected || stompClient == null) {
        return;
      }

      const subscription = stompClient.subscribe(destination, (message) => {
        callback(JSON.parse(message.body) as T);
      });

      const next = new Map(subscriptions);
      next.set(destination, subscription);
      set({ subscriptions: next });
    },

    unsubscribe: (destination: string) => {
      const { subscriptions } = get();

      const subscription = subscriptions.get(destination);
      if (!subscription) return;

      subscription.unsubscribe();

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
