import { beforeEach, describe, expect, it } from 'vitest';
import useNotificationStore from '@/lib/stores/useNotificationStore';
import type { NotificationDto } from '@/lib/types';

const notification = (
  id: string,
  overrides: Partial<NotificationDto> = {},
): NotificationDto => ({
  id,
  createdAt: '2026-08-29T00:00:00Z',
  receiverId: 'receiver-id',
  title: 'notification',
  content: 'content',
  level: 'INFO',
  type: 'DIRECT_MESSAGE',
  resourceId: 'conversation-id',
  readAt: null,
  ...overrides,
});

describe('notification read state', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      data: [],
      params: { limit: 20, sortBy: 'createdAt', sortDirection: 'DESCENDING' },
      cursorState: { hasNext: false, totalCount: 0, unreadCount: 0 },
      loading: false,
      error: undefined,
    });
  });

  it('알림을 읽어도 목록에 유지하고 unreadCount만 줄인다', () => {
    const unread = notification('unread');
    const alreadyRead = notification('already-read', { readAt: '2026-08-28T00:00:00Z' });
    useNotificationStore.setState({
      data: [unread, alreadyRead],
      cursorState: { hasNext: false, totalCount: 2, unreadCount: 1 },
    });

    useNotificationStore.getState().markRead(unread.id, '2026-08-29T00:01:00Z');

    expect(useNotificationStore.getState().data).toHaveLength(2);
    expect(useNotificationStore.getState().data[0].readAt).toBe('2026-08-29T00:01:00Z');
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
    expect(useNotificationStore.getState().cursorState.totalCount).toBe(2);
  });

  it('같은 대화의 읽지 않은 DM 알림만 일괄 읽음 처리한다', () => {
    const sameConversation = notification('same-conversation');
    const otherConversation = notification('other-conversation', { resourceId: 'other-id' });
    const follow = notification('follow', { type: 'FOLLOW' });
    useNotificationStore.setState({
      data: [sameConversation, otherConversation, follow],
      cursorState: { hasNext: false, totalCount: 3, unreadCount: 3 },
    });

    useNotificationStore.getState().markConversationRead(
      'conversation-id',
      '2026-08-29T00:02:00Z',
    );

    const state = useNotificationStore.getState();
    expect(state.data.find((item) => item.id === 'same-conversation')?.readAt)
      .toBe('2026-08-29T00:02:00Z');
    expect(state.data.find((item) => item.id === 'other-conversation')?.readAt).toBeNull();
    expect(state.data.find((item) => item.id === 'follow')?.readAt).toBeNull();
    expect(state.unreadCount()).toBe(2);
  });

  it('배지는 totalCount가 아니라 서버 unreadCount를 사용한다', () => {
    useNotificationStore.setState({
      cursorState: { hasNext: false, totalCount: 12, unreadCount: 2 },
    });

    expect(useNotificationStore.getState().unreadCount()).toBe(2);
  });
});
