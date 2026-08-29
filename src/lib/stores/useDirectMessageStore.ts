import { create } from 'zustand';
import { getDirectMessages } from '@/lib/api/conversations';
import { createPaginatedStoreActions } from '@/lib/stores/actions';
import type { DirectMessageDto, FindDmsParams } from '@/lib/types';
import type { PaginatedStore } from '@/lib/stores/types';

type DirectMessageParams = FindDmsParams & { conversationId: string };

interface DirectMessageStore extends PaginatedStore<DirectMessageDto, DirectMessageParams> {
  /** 저장 응답을 서버 ID 또는 clientMessageId 기준으로 한 번만 반영합니다. */
  upsertRealtime: (message: DirectMessageDto) => void;
  /** 상대방의 읽음 워터마크까지 해당 수신자의 메시지를 읽음 처리합니다. */
  markReadThrough: (readerId: string, lastReadMessageSequence: number, readAt: string) => void;
}

const sortByCreatedAt = (
  messages: DirectMessageDto[],
  direction: FindDmsParams['sortDirection'],
) => [...messages].sort((a, b) => {
  const compared = a.createdAt.localeCompare(b.createdAt);
  if (compared !== 0) {
    return direction === 'ASCENDING' ? compared : -compared;
  }

  return direction === 'ASCENDING'
    ? a.id.localeCompare(b.id)
    : b.id.localeCompare(a.id);
});

const useDirectMessageStore = create<DirectMessageStore>((set, get) => {
  const paginatedActions = createPaginatedStoreActions<DirectMessageDto, DirectMessageParams>({
    set,
    get,
    fetchApi: (params) => {
      const { conversationId, ...queryParams } = params;
      return getDirectMessages(conversationId, queryParams);
    },
    initialData: {
      params: { conversationId: '', limit: 20, sortBy: 'createdAt', sortDirection: 'DESCENDING' },
    },
  });

  return {
    ...paginatedActions,

    upsertRealtime: (message) => {
      set((state) => {
        const correlatedIndex = state.data.findIndex((current) =>
          current.id === message.id
          || (
            message.clientMessageId != null
            && current.clientMessageId === message.clientMessageId
          ),
        );

        const next = [...state.data];
        if (correlatedIndex >= 0) {
          next[correlatedIndex] = message;
        } else {
          next.push(message);
        }

        return {
          data: sortByCreatedAt(next, state.params.sortDirection),
          cursorState: correlatedIndex >= 0
            ? state.cursorState
            : {
                ...state.cursorState,
                totalCount: state.cursorState.totalCount + 1,
              },
        };
      });
    },

    markReadThrough: (readerId, lastReadMessageSequence, readAt) => {
      set((state) => ({
        data: state.data.map((message) =>
          message.receiver.userId === readerId
          && message.messageSequence <= lastReadMessageSequence
          && !message.readAt
            ? { ...message, readAt }
            : message,
        ),
      }));
    },
  };
});

export default useDirectMessageStore;
