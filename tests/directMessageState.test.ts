import { beforeEach, describe, expect, it } from 'vitest';
import useDirectMessageStore from '@/lib/stores/useDirectMessageStore';
import type { DirectMessageDto, UserSummary } from '@/lib/types';
import {
  removePersistedOutgoingMessage,
  updateOutgoingMessageStatus,
  type OutgoingMessage,
} from '@/pages/conversations/outgoingMessageState';

const sender: UserSummary = {
  userId: 'sender-id',
  name: 'sender',
  profileImageUrl: null,
};

const receiver: UserSummary = {
  userId: 'receiver-id',
  name: 'receiver',
  profileImageUrl: null,
};

const directMessage = (
  id: string,
  messageSequence: number,
  overrides: Partial<DirectMessageDto> = {},
): DirectMessageDto => ({
  id,
  conversationId: 'conversation-id',
  createdAt: `2026-08-29T00:00:0${messageSequence}Z`,
  messageSequence,
  sender,
  receiver,
  content: `message-${messageSequence}`,
  readAt: null,
  ...overrides,
});

describe('direct message realtime state', () => {
  beforeEach(() => {
    useDirectMessageStore.setState({
      data: [],
      params: {
        conversationId: 'conversation-id',
        limit: 20,
        sortBy: 'createdAt',
        sortDirection: 'DESCENDING',
      },
      cursorState: { hasNext: false, totalCount: 0 },
      loading: false,
      error: undefined,
    });
  });

  it('같은 clientMessageId의 저장 응답을 새 메시지로 중복 추가하지 않는다', () => {
    const clientMessageId = 'client-message-id';
    const first = directMessage('server-message-1', 1, { clientMessageId });
    const duplicateCreatedEvent = directMessage('server-message-2', 1, {
      clientMessageId,
      content: 'persisted message',
    });

    useDirectMessageStore.getState().upsertRealtime(first);
    useDirectMessageStore.getState().upsertRealtime(duplicateCreatedEvent);

    expect(useDirectMessageStore.getState().data).toEqual([duplicateCreatedEvent]);
    expect(useDirectMessageStore.getState().cursorState.totalCount).toBe(1);
  });

  it('읽은 사람의 워터마크 이하 수신 메시지만 읽음 처리한다', () => {
    const readAt = '2026-08-29T00:10:00Z';
    const alreadyReadAt = '2026-08-29T00:05:00Z';
    const messages = [
      directMessage('read-target', 1),
      directMessage('after-watermark', 3),
      directMessage('sent-by-reader', 2, { sender: receiver, receiver: sender }),
      directMessage('already-read', 2, { readAt: alreadyReadAt }),
    ];
    useDirectMessageStore.setState({ data: messages });

    useDirectMessageStore.getState().markReadThrough(receiver.userId, 2, readAt);

    const result = useDirectMessageStore.getState().data;
    expect(result.find((message) => message.id === 'read-target')?.readAt).toBe(readAt);
    expect(result.find((message) => message.id === 'after-watermark')?.readAt).toBeNull();
    expect(result.find((message) => message.id === 'sent-by-reader')?.readAt).toBeNull();
    expect(result.find((message) => message.id === 'already-read')?.readAt).toBe(alreadyReadAt);
  });

  it('저장 성공 뒤 늦은 receipt 실패가 임시 실패 메시지를 되살리지 않는다', () => {
    const outgoing: OutgoingMessage = {
      clientMessageId: 'client-message-id',
      conversationId: 'conversation-id',
      content: 'hello',
      createdAt: '2026-08-29T00:00:00Z',
      status: 'pending',
    };

    const afterCreatedEvent = removePersistedOutgoingMessage(
      [outgoing],
      outgoing.clientMessageId,
    );
    const afterLateReceiptFailure = updateOutgoingMessageStatus(
      afterCreatedEvent,
      outgoing.clientMessageId,
      'failed',
    );

    expect(afterLateReceiptFailure).toEqual([]);
  });
});
