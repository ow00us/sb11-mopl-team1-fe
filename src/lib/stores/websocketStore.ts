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
  sendWithReceipt: (destination: string, body: unknown) => Promise<void>;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const SEND_RECEIPT_TIMEOUT_MS = 10_000;

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
   * STOMP 401 이후 진행 중인 인증 복구 작업입니다.
   *
   * ERROR 프레임과 WebSocket close 콜백이 거의 동시에 실행되거나 여러 화면이
   * connect 를 호출하더라도 Refresh Token Rotation 요청은 한 번만 보내야 합니다.
   */
  let pendingAuthRecovery: Promise<void> | null = null;

  /**
   * 현재 유효한 STOMP 클라이언트를 구분하는 세대 번호입니다.
   *
   * 이전 소켓을 종료한 뒤 늦게 도착한 close/error 콜백이 새 연결 상태를
   * 덮어쓰지 못하도록 각 콜백에서 생성 당시 번호를 확인합니다.
   */
  let clientGeneration = 0;

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

  const pendingSends = new Map<
    string,
    {
      timeoutId: ReturnType<typeof setTimeout>;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  >();

  const rejectPendingSends = (error: Error) => {
    pendingSends.forEach(({ timeoutId, reject }) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    pendingSends.clear();
  };

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
    clientGeneration += 1;
    client.reconnectDelay = 0;
    void client.deactivate();
    pendingConnect = null;
    pendingClient = null;
    // 구독 의도는 남겨 둡니다. 사용자가 안내의 다시 연결 버튼을 누르면 같은
    // 화면의 목적지를 새 연결에 복원해야 합니다.
    rejectPendingSends(new Error(error.message));
    set({
      stompClient: null,
      isConnected: false,
      isConnecting: false,
      subscriptions: new Map(),
      lastError: error,
      isBlocked: true,
    });
  };

  /**
   * STOMP 인증 실패를 Refresh Token으로 한 번 복구합니다.
   *
   * 서버가 ERROR 프레임 뒤 연결을 닫으므로 기존 클라이언트의 자동 재연결은
   * 중단합니다. 화면이 요청한 구독 목록은 유지하고, 새 Access Token을 발급받은
   * 뒤 새 STOMP 클라이언트로 연결하여 onConnect에서 구독을 복원합니다.
   */
  const recoverAuthentication = (
    failedClient: Client,
    error: ErrorResponse,
  ): Promise<void> => {
    if (pendingAuthRecovery) {
      return pendingAuthRecovery;
    }

    // 실패한 클라이언트의 늦은 콜백을 무효화하고 자동 재연결을 중단합니다.
    clientGeneration += 1;
    const recoveryGeneration = clientGeneration;
    failedClient.reconnectDelay = 0;
    pendingClient = null;
    pendingConnect = null;

    set({
      stompClient: null,
      isConnected: false,
      isConnecting: true,
      subscriptions: new Map(),
      lastError: error,
      isBlocked: false,
    });

    const recoveryPromise = (async () => {
      await failedClient.deactivate();

      // 복구 도중 로그아웃 등으로 명시적 disconnect가 실행됐다면 중단합니다.
      if (recoveryGeneration !== clientGeneration) return;

      const restored =
        await useAuthStore.getState().restoreSession();
      const refreshedAccessToken =
        useAuthStore.getState().getAccessToken();

      if (recoveryGeneration !== clientGeneration) return;

      if (!restored || !refreshedAccessToken) {
        // Refresh Token까지 사용할 수 없을 때에만 로그인 상태와 구독을 버립니다.
        desiredSubscriptions.clear();
        useAuthStore.getState().clear();
        set({
          stompClient: null,
          isConnected: false,
          isConnecting: false,
          subscriptions: new Map(),
          lastError: error,
          isBlocked: true,
        });

        if (window.location.hash !== '#/sign-in') {
          window.location.replace('#/sign-in');
        }
        return;
      }

      // 아래 connect가 인증 복구 Promise 자신을 다시 반환하지 않도록 먼저
      // 복구 잠금을 해제합니다. 이 시점에는 새 Access Token이 Store에 반영됐습니다.
      pendingAuthRecovery = null;
      await get().connect(refreshedAccessToken);
    })().catch((recoveryError: unknown) => {
      // 재발급에는 성공했지만 네트워크 재연결이 실패한 경우 구독 의도는 유지합니다.
      // 이후 화면의 재시도 또는 stompjs 연결 흐름이 같은 목적지 구독을 복원합니다.
      console.error('[stomp] 인증 복구 후 재연결에 실패했습니다:', recoveryError);
      set({
        stompClient: null,
        isConnected: false,
        isConnecting: false,
        subscriptions: new Map(),
        lastError: error,
        isBlocked: false,
      });
    });

    pendingAuthRecovery = recoveryPromise;

    void recoveryPromise.then(
      () => {
        if (pendingAuthRecovery === recoveryPromise) {
          pendingAuthRecovery = null;
        }
      },
      () => {
        if (pendingAuthRecovery === recoveryPromise) {
          pendingAuthRecovery = null;
        }
      },
    );

    return recoveryPromise;
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

      // 인증 복구 중 새 연결을 만들면 이전 Access Token을 사용하는 클라이언트가
      // 하나 더 생길 수 있으므로 모든 호출자가 같은 복구 작업을 기다립니다.
      if (pendingAuthRecovery) return pendingAuthRecovery;

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
        connectionTimeout: 10_000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      const generation = ++clientGeneration;
      let wasConnected = false;
      let reconnectFailures = 0;

      pendingClient = client;

      // 재연결 시점의 토큰을 다시 읽습니다. connectHeaders 를 만들 때 잡아둔 토큰은
      // 그 사이 갱신되었더라도 그대로 남아 있어, 만료 후에는 계속 401 을 받습니다.
      client.beforeConnect = () => {
        const currentToken = useAuthStore.getState().getAccessToken() ?? accessToken;
        client.connectHeaders = { Authorization: `Bearer ${currentToken}` };
      };

      const connectionPromise = new Promise<void>((resolve, reject) => {
        client.onConnect = () => {
          if (generation !== clientGeneration) return;

          wasConnected = true;
          reconnectFailures = 0;

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
          if (generation !== clientGeneration) return;

          const error = parseStompErrorFrame(frame);
          rejectPendingSends(new Error(error.message));

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
            // 만료된 Access Token은 Refresh Token 재발급으로 복구할 수 있습니다.
            // 현재 연결 Promise를 먼저 종료한 뒤 복구 작업이 새 연결을 만듭니다.
            console.debug('[stomp] 인증 실패. 토큰 재발급 후 재연결합니다:', error);
            reject(error);
            void recoverAuthentication(client, error);
            return;
          }

          // 그 밖의 오류는 일시적일 수 있어 stompjs 의 자동 재연결에 맡깁니다.
          // 재연결 과정은 사용자에게 알리지 않고 로그로만 남깁니다.
          console.debug('[stomp] 일시 오류. 자동 재연결에 맡깁니다:', error);
          set({ isConnected: false, isConnecting: false, lastError: error });
        };

        client.onWebSocketClose = () => {
          if (generation !== clientGeneration) return;
          if (get().isBlocked) return;

          rejectPendingSends(new Error('연결이 끊어져 메시지를 전송하지 못했습니다.'));

          // 정상 연결이 끊긴 시점은 재연결 실패 횟수에 포함하지 않습니다. 그 뒤
          // 새 연결이 성립하지 못하고 다시 닫힐 때마다 한 번씩 계산합니다.
          if (wasConnected) {
            wasConnected = false;
            reconnectFailures = 0;
          } else {
            reconnectFailures += 1;
          }

          if (reconnectFailures >= MAX_RECONNECT_ATTEMPTS) {
            console.debug(
              `[stomp] 자동 재연결 ${MAX_RECONNECT_ATTEMPTS}회 실패로 중단합니다.`,
            );
            block(client, {
              exceptionName: 'WebSocketReconnectExhausted',
              message: '연결이 끊어졌습니다. 다시 시도해 주세요.',
              details: { attempts: String(MAX_RECONNECT_ATTEMPTS) },
              errorCode: 'REALTIME_CONNECTION_FAILED',
            });
            return;
          }
          // 재연결하면 서버는 구독이 없는 새 STOMP 세션을 만듭니다. Map 을 비우지
          // 않으면 화면이 다시 subscribe 해도 이미 구독 중으로 보고 건너뛰어,
          // 연결은 되었는데 메시지가 오지 않는 상태가 됩니다.
          set({ isConnected: false, isConnecting: false, subscriptions: new Map() });
        };

        client.activate();
      });

      pendingConnect = connectionPromise;

      void connectionPromise.then(
        () => {
          if (pendingConnect === connectionPromise) {
            pendingConnect = null;
            pendingClient = null;
          }
        },
        () => {
          if (pendingConnect === connectionPromise) {
            pendingConnect = null;
            pendingClient = null;
          }
        },
      );

      return connectionPromise;
    },

    disconnect: () => {
      const { stompClient } = get();
      clientGeneration += 1;
      if (stompClient) {
        stompClient.reconnectDelay = 0;
        void stompClient.deactivate();
      }
      if (pendingClient && pendingClient !== stompClient) {
        pendingClient.reconnectDelay = 0;
        void pendingClient.deactivate();
      }
      pendingConnect = null;
      pendingClient = null;
      // 명시적 종료이므로 요청해 둔 구독도 버립니다. 남겨두면 다음 로그인에서
      // 화면이 요청하지도 않은 구독이 되살아납니다.
      desiredSubscriptions.clear();
      rejectPendingSends(new Error('연결이 종료되어 메시지를 전송하지 못했습니다.'));
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

    sendWithReceipt: (destination: string, body: unknown) => {
      const { stompClient, isConnected } = get();

      if (!stompClient || !isConnected) {
        return Promise.reject(new Error('WebSocket이 연결되어 있지 않습니다.'));
      }

      const receiptId = `dm-send-${crypto.randomUUID()}`;

      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const pending = pendingSends.get(receiptId);
          if (!pending) return;

          pendingSends.delete(receiptId);
          pending.reject(new Error('메시지 전송 확인 시간이 초과되었습니다.'));
        }, SEND_RECEIPT_TIMEOUT_MS);

        pendingSends.set(receiptId, { timeoutId, resolve, reject });

        stompClient.watchForReceipt(receiptId, () => {
          const pending = pendingSends.get(receiptId);
          if (!pending) return;

          clearTimeout(pending.timeoutId);
          pendingSends.delete(receiptId);
          pending.resolve();
        });

        try {
          stompClient.publish({
            destination,
            headers: { receipt: receiptId },
            body: JSON.stringify(body),
          });
        } catch (error) {
          clearTimeout(timeoutId);
          pendingSends.delete(receiptId);
          reject(error instanceof Error ? error : new Error('메시지 전송에 실패했습니다.'));
        }
      });
    },
  };
});
