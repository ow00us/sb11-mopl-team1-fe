import { create } from 'zustand';
import { getNotifications } from '@/lib/api/notifications';
import { createPaginatedStoreActions } from '@/lib/stores/actions';
import type { NotificationDto, GetNotificationsParams } from '@/lib/types';
import type { PaginatedStore } from '@/lib/stores/types';

interface NotificationStore extends PaginatedStore<NotificationDto, GetNotificationsParams> {
  unreadCount: () => number;
  markRead: (notificationId: string, readAt: string) => void;
  markConversationRead: (conversationId: string, readAt: string) => void;
}

const useNotificationStore = create<NotificationStore>((set, get) => {
  const paginatedActions = createPaginatedStoreActions<NotificationDto, GetNotificationsParams>({
    set,
    get,
    fetchApi: getNotifications,
    initialData: {
      params: { limit: 20, sortBy: 'createdAt', sortDirection: 'DESCENDING' },
    },
  });

  return {
    ...paginatedActions,

    add: (notification) => {
      const isDuplicate = get().data.some((current) => current.id === notification.id);
      paginatedActions.add(notification);

      if (!isDuplicate && !notification.readAt) {
        set((state) => ({
          cursorState: state.cursorState.unreadCount == null
            ? state.cursorState
            : {
                ...state.cursorState,
                unreadCount: state.cursorState.unreadCount + 1,
              },
        }));
      }
    },

    unreadCount: () => get().cursorState.unreadCount ?? get().cursorState.totalCount,

    markRead: (notificationId, readAt) => {
      set((state) => {
        const target = state.data.find((notification) => notification.id === notificationId);
        if (!target || target.readAt) return state;

        const currentUnreadCount =
          state.cursorState.unreadCount ?? state.cursorState.totalCount;

        return {
          data: state.data.map((notification) =>
            notification.id === notificationId
              ? { ...notification, readAt }
              : notification,
          ),
          cursorState: {
            ...state.cursorState,
            unreadCount: Math.max(0, currentUnreadCount - 1),
          },
        };
      });
    },

    markConversationRead: (conversationId, readAt) => {
      set((state) => {
        const unreadIds = new Set(
          state.data
            .filter((notification) =>
              notification.type === 'DIRECT_MESSAGE'
              && notification.resourceId === conversationId
              && !notification.readAt,
            )
            .map((notification) => notification.id),
        );

        if (unreadIds.size === 0) return state;

        const currentUnreadCount =
          state.cursorState.unreadCount ?? state.cursorState.totalCount;

        return {
          data: state.data.map((notification) =>
            unreadIds.has(notification.id)
              ? { ...notification, readAt }
              : notification,
          ),
          cursorState: {
            ...state.cursorState,
            unreadCount: Math.max(0, currentUnreadCount - unreadIds.size),
          },
        };
      });
    },
  };
});

export default useNotificationStore;
