import { useEffect, useState } from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import { useWebSocketStore } from '@/lib/stores/websocketStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import useDirectMessageStore from '@/lib/stores/useDirectMessageStore';
import ConversationList from './components/ConversationList';
import MessageThread from './components/MessageThread';
import type { FailedMessage } from './components/MessageThread';
import EmptyState from './components/EmptyState';
import type { DirectMessageRealtimeEvent } from '@/lib/types';
import {markDirectMessageAsRead} from "@/lib/api";
import useConversationStore from "@/lib/stores/useConversationStore.ts";
import { featureFlags } from '@/lib/config/features';

export default function ConversationsPage() {
  const navigate = useNavigate();
  const { conversationId: selectedConversationId  } = useParams<{ conversationId: string }>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);
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
              useDirectMessageStore.getState().add(message);

              // 수신 메시지만 읽음 처리합니다. 내가 보낸 메시지에 읽음 API를 호출하면
              // 백엔드 권한 규칙상 403이므로 상대방의 이벤트를 기다립니다.
              if (message.receiver.userId === authentication.userDto.id) {
                void markDirectMessageAsRead(selectedConversationId, message.id).catch((error) => {
                  console.error('Failed to mark direct message as read:', error);
                });
              }

              updateConversation(selectedConversationId, {
                latestMessage: message,
                hasUnread: false,
              });
              return;
            }

            useDirectMessageStore.getState().update(event.data.lastReadMessageId, {
              readAt: event.data.readAt,
            });
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
  const sendMessage = async (conversationId: string, content: string) => {
    await sendWithReceipt(`/pub/conversations/${conversationId}/direct-messages`, { content });
  };

  const handleSendMessage = (content: string) => {
    if (!selectedConversationId) return;

    const conversationId = selectedConversationId;
    void sendMessage(conversationId, content).catch((error) => {
      console.error('Failed to send message:', error);
      setFailedMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          conversationId,
          content,
          createdAt: new Date().toISOString(),
        },
      ]);
    });
  };

  const handleRetryMessage = (messageId: string) => {
    const failedMessage = failedMessages.find((message) => message.id === messageId);
    if (!failedMessage || retryingMessageIds.has(messageId)) return;

    setRetryingMessageIds((current) => new Set(current).add(messageId));

    void sendMessage(failedMessage.conversationId, failedMessage.content)
      .then(() => {
        setFailedMessages((current) => current.filter((message) => message.id !== messageId));
      })
      .catch((error) => {
        console.error('Failed to retry message:', error);
      })
      .finally(() => {
        setRetryingMessageIds((current) => {
          const next = new Set(current);
          next.delete(messageId);
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
            failedMessages={failedMessages.filter(
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
