import { useEffect, useState } from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import { useWebSocketStore } from '@/lib/stores/websocketStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import useDirectMessageStore from '@/lib/stores/useDirectMessageStore';
import ConversationList from './components/ConversationList';
import MessageThread from './components/MessageThread';
import EmptyState from './components/EmptyState';
import type { DirectMessageRealtimeEvent, DirectMessageSendRequest } from '@/lib/types';
import {markDirectMessageAsRead} from "@/lib/api";
import useConversationStore from "@/lib/stores/useConversationStore.ts";
import { featureFlags } from '@/lib/config/features';
import useNotificationStore from '@/lib/stores/useNotificationStore';
import {
  removePersistedOutgoingMessage,
  updateOutgoingMessageStatus,
  type OutgoingMessage,
} from './outgoingMessageState';

export default function ConversationsPage() {
  const navigate = useNavigate();
  const { conversationId: selectedConversationId  } = useParams<{ conversationId: string }>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [outgoingMessages, setOutgoingMessages] = useState<OutgoingMessage[]>([]);
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<string>>(new Set());
  const {update: updateConversation} = useConversationStore();

  // Stores
  const { connect, subscribe, unsubscribe, isConnected, sendWithReceipt } = useWebSocketStore();
  const { data: authentication } = useAuthStore();

  // WebSocket connection and subscription
  useEffect(() => {
    if (!featureFlags.directMessageSend || !selectedConversationId || !authentication) return;

    const accessToken = authentication.accessToken;

    const setupWebSocket = async () => {
      setIsConnecting(true);

      try {
        await connect(accessToken);

        // Subscribe to conversation-specific message channel
        subscribe<DirectMessageRealtimeEvent>(
          `/sub/conversations/${selectedConversationId}/direct-messages`,
          (event) => {
            if (event.type === 'DIRECT_MESSAGE_CREATED') {
              const message = event.data;
              useDirectMessageStore.getState().upsertRealtime(message);

              // 저장 성공 응답이 임시 메시지와 상관관계가 있으면 임시/실패 상태를
              // 제거합니다. receipt 타임아웃 catch가 나중에 실행돼도 다시 추가하지
              // 않으므로 저장된 메시지와 실패 메시지가 함께 보이지 않습니다.
              if (message.clientMessageId) {
                setOutgoingMessages((current) => removePersistedOutgoingMessage(
                  current,
                  message.clientMessageId!,
                ));
              }

              const isIncoming = message.receiver.userId === authentication.userDto.id;

              updateConversation(selectedConversationId, {
                latestMessage: message,
                hasUnread: isIncoming,
              });

              // 수신 메시지만 읽음 처리합니다. 내가 보낸 메시지에 읽음 API를 호출하면
              // 백엔드 권한 규칙상 403이므로 상대방의 이벤트를 기다립니다.
              if (isIncoming) {
                void markDirectMessageAsRead(selectedConversationId, message.id)
                  .then(() => {
                    const readAt = new Date().toISOString();
                    updateConversation(selectedConversationId, { hasUnread: false });
                    useNotificationStore.getState().markConversationRead(
                      selectedConversationId,
                      readAt,
                    );
                  })
                  .catch((error) => {
                    console.error('Failed to mark direct message as read:', error);
                  });
              }
              return;
            }

            if (Number.isFinite(event.data.lastReadMessageSequence)) {
              useDirectMessageStore.getState().markReadThrough(
                event.data.readerId,
                event.data.lastReadMessageSequence,
                event.data.readAt,
              );
              return;
            }

            // 새 워터마크 계약 배포 전 서버와의 짧은 호환 구간을 지원합니다.
            const legacyMessageId = event.data.lastReadMessageId ?? event.data.directMessageId;
            if (legacyMessageId) {
              useDirectMessageStore.getState().update(legacyMessageId, {
                readAt: event.data.readAt,
              });
            }
          },
        );
      } catch (error) {
        console.error('WebSocket setup failed:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    setupWebSocket();

    // Cleanup on unmount or conversation change
    return () => {
      unsubscribe(`/sub/conversations/${selectedConversationId}/direct-messages`);
    };
  }, [selectedConversationId, authentication, connect, subscribe, unsubscribe, updateConversation]);

  // Handle conversation selection
  const handleSelectConversation = (conversationId: string) => {
    navigate(`/conversations/${conversationId}`);
  };

  // Handle sending message
  const sendMessage = async (
    conversationId: string,
    request: DirectMessageSendRequest,
  ) => {
    await sendWithReceipt(`/pub/conversations/${conversationId}/direct-messages`, request);
  };

  const handleSendMessage = (content: string) => {
    if (!selectedConversationId) return;

    const conversationId = selectedConversationId;
    const clientMessageId = crypto.randomUUID();
    const outgoingMessage: OutgoingMessage = {
      clientMessageId,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    setOutgoingMessages((current) => [...current, outgoingMessage]);

    void sendMessage(conversationId, { clientMessageId, content }).catch((error) => {
      console.error('Failed to send message:', error);
      setOutgoingMessages((current) => updateOutgoingMessageStatus(
        current,
        clientMessageId,
        'failed',
      ));
    });
  };

  const handleRetryMessage = (clientMessageId: string) => {
    const failedMessage = outgoingMessages.find(
      (message) => message.clientMessageId === clientMessageId,
    );
    if (!failedMessage || retryingMessageIds.has(clientMessageId)) return;

    setRetryingMessageIds((current) => new Set(current).add(clientMessageId));
    setOutgoingMessages((current) => updateOutgoingMessageStatus(
      current,
      clientMessageId,
      'pending',
    ));

    // 재시도는 같은 논리 메시지이므로 clientMessageId를 재사용합니다. 원 요청의
    // 저장 응답이 늦게 와도 동일한 임시 메시지를 정리할 수 있고, 같은 ID로 온
    // 저장 이벤트가 둘이면 화면에는 한 건만 남습니다.
    void sendMessage(failedMessage.conversationId, {
      clientMessageId,
      content: failedMessage.content,
    })
      .catch((error) => {
        console.error('Failed to retry message:', error);
        setOutgoingMessages((current) => updateOutgoingMessageStatus(
          current,
          clientMessageId,
          'failed',
        ));
      })
      .finally(() => {
        setRetryingMessageIds((current) => {
          const next = new Set(current);
          next.delete(clientMessageId);
          return next;
        });
      });
  };

  return (
    <div className="flex w-full h-[calc(100vh-80px)] bg-background">
      {/* Left Panel: Conversation List */}
      <div className="w-[400px] border-r border-gray-800 flex flex-col">
        <ConversationList
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* Right Panel: Message Thread or Empty State */}
      <div className="flex-1">
        {selectedConversationId ? (
          <MessageThread
            conversationId={selectedConversationId}
            onSendMessage={handleSendMessage}
            outgoingMessages={outgoingMessages.filter(
              (message) => message.conversationId === selectedConversationId,
            )}
            retryingMessageIds={retryingMessageIds}
            onRetryMessage={handleRetryMessage}
            isConnected={featureFlags.directMessageSend && isConnected && !isConnecting}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
