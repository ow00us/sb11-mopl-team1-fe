import { EventSourcePolyfill } from 'event-source-polyfill';
import { create } from 'zustand';
import { API_BASE_URL } from '@/lib/config/env';

type SseStatus = 'IDLE' | 'CONNECTING' | 'OPEN' | 'CLOSED';

type SubscriberCallback = (data: any) => void;
type WrappedListener = (event: MessageEvent) => void;

interface SseState {
  eventSource: EventSource | null;
  status: SseStatus;
  isConnected: boolean;
  // 사용자 콜백 원본. 재연결 시 다시 등록하기 위해 항상 보관합니다.
  subscribers: Map<string, SubscriberCallback>;
  // 현재 EventSource 에 attach 된 wrapped listener. removeEventListener 에 필요합니다.
  attachedListeners: Map<string, WrappedListener>;

  connect: (accessToken: string) => Promise<void>;
  disconnect: () => void;
  subscribe: (topic: string, callback: SubscriberCallback) => void;
  unsubscribe: (topic: string) => void;
}

const wrapCallback =
  (callback: SubscriberCallback): WrappedListener =>
  (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      callback(data);
    } catch (error) {
      console.error('[SSE] Message parsing error:', error);
      callback(event.data);
    }
  };

const detachAllListeners = (
  eventSource: EventSource | null,
  attached: Map<string, WrappedListener>,
) => {
  if (!eventSource) return;
  attached.forEach((listener, topic) => {
    eventSource.removeEventListener(topic, listener);
  });
};

export const useSseStore = create<SseState>((set, get) => {
  /**
   * subscribers 로 등록된 콜백을 모두 새 wrapped listener 로 감싸 EventSource 에 attach 합니다.
   * OPEN 전이 시점(연결 성공, 재연결 성공)에만 호출합니다.
   */
  const flushSubscribers = (eventSource: EventSource) => {
    const { subscribers } = get();
    const attached = new Map<string, WrappedListener>();
    subscribers.forEach((callback, topic) => {
      const listener = wrapCallback(callback);
      eventSource.addEventListener(topic, listener);
      attached.set(topic, listener);
    });
    set({ attachedListeners: attached });
  };

  return {
    eventSource: null,
    status: 'IDLE',
    isConnected: false,
    subscribers: new Map(),
    attachedListeners: new Map(),

    connect: async (accessToken) => {
      const { status } = get();
      // 이미 진행 중이거나 열린 상태에서 재진입 금지.
      if (status === 'CONNECTING' || status === 'OPEN') return;

      set({ status: 'CONNECTING' });

      try {
        const eventSource = new EventSourcePolyfill(`${API_BASE_URL}/api/sse`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          withCredentials: true,
        });

        eventSource.onopen = () => {
          set({ eventSource, status: 'OPEN', isConnected: true });
          flushSubscribers(eventSource);
        };

        eventSource.onerror = () => {
          // 폴리필이 auto-retry 를 진행 중이면 CONNECTING 으로 표기만 하고 정리하지 않습니다.
          // 완전히 CLOSED 인 경우에만 리스너를 detach 하고 상태를 CLOSED 로 확정합니다.
          const readyState = (eventSource as unknown as { readyState: number }).readyState;
          if (readyState === EventSourcePolyfill.CLOSED) {
            detachAllListeners(eventSource, get().attachedListeners);
            set({
              eventSource: null,
              status: 'CLOSED',
              isConnected: false,
              attachedListeners: new Map(),
            });
          } else {
            set({ status: 'CONNECTING', isConnected: false });
          }
        };
      } catch (error) {
        console.error('[SSE] Connection error:', error);
        set({ eventSource: null, status: 'CLOSED', isConnected: false });
      }
    },

    disconnect: () => {
      const { eventSource, attachedListeners } = get();
      detachAllListeners(eventSource, attachedListeners);
      if (eventSource) eventSource.close();
      set({
        eventSource: null,
        status: 'CLOSED',
        isConnected: false,
        subscribers: new Map(),
        attachedListeners: new Map(),
      });
    },

    subscribe: (topic, callback) => {
      const { subscribers, attachedListeners, eventSource, status } = get();
      if (subscribers.has(topic)) {
        return;
      }

      const nextSubscribers = new Map(subscribers);
      nextSubscribers.set(topic, callback);

      if (status === 'OPEN' && eventSource) {
        const listener = wrapCallback(callback);
        eventSource.addEventListener(topic, listener);
        const nextAttached = new Map(attachedListeners);
        nextAttached.set(topic, listener);
        set({ subscribers: nextSubscribers, attachedListeners: nextAttached });
      } else {
        // pending: OPEN 전이 시 flushSubscribers 에서 attach.
        set({ subscribers: nextSubscribers });
      }
    },

    unsubscribe: (topic) => {
      const { subscribers, attachedListeners, eventSource } = get();
      if (!subscribers.has(topic)) return;

      const nextSubscribers = new Map(subscribers);
      nextSubscribers.delete(topic);

      const nextAttached = new Map(attachedListeners);
      const listener = nextAttached.get(topic);
      if (listener && eventSource) {
        eventSource.removeEventListener(topic, listener);
      }
      nextAttached.delete(topic);

      set({ subscribers: nextSubscribers, attachedListeners: nextAttached });
    },
  };
});