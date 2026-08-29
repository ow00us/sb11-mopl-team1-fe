import { useEffect, useLayoutEffect, useRef } from 'react';
import useDirectMessageStore from '@/lib/stores/useDirectMessageStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ConnectionBanner from './ConnectionBanner';
import FailedMessageBubble from './FailedMessageBubble';
import icProfileDefault from '@/assets/ic_profile_default.svg';
import useConversationDetailStore from "@/lib/stores/useConversationDetailStore.ts";
import {markDirectMessageAsRead} from "@/lib/api";
import useConversationStore from "@/lib/stores/useConversationStore.ts";
import {useNavigate} from "react-router-dom";
import useNotificationStore from '@/lib/stores/useNotificationStore';

interface MessageThreadProps {
  conversationId: string;
  onSendMessage: (content: string) => void;
  failedMessages: FailedMessage[];
  retryingMessageIds: Set<string>;
  onRetryMessage: (messageId: string) => void;
  isConnected: boolean;
}

export interface FailedMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
}

export default function MessageThread({
  conversationId,
  onSendMessage,
  failedMessages,
  retryingMessageIds,
  onRetryMessage,
  isConnected,
}: MessageThreadProps) {
  const { data: conversation, updateParams: updateConversationDetailParam, clearData: clearConversationDetailData } = useConversationDetailStore();
  const { data: messages, loading, updateParams, clearData, fetchMore, hasNext } = useDirectMessageStore();
  const { data: authentication } = useAuthStore();
  const { update: updateConversation } = useConversationStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  /** 과거 메시지를 붙이기 직전의 스크롤 기준점입니다. 보정이 끝나면 비웁니다. */
  const pendingRestoreRef = useRef<{ height: number; top: number } | null>(null);
  /** 이번 렌더는 과거 메시지가 붙은 것이므로 맨 아래로 내리지 않습니다. */
  const skipAutoScrollRef = useRef(false);
  const navigate = useNavigate();

  // Fetch messages when conversation changes

  useEffect(() => {
    if (conversationId) {
      updateConversationDetailParam({conversationId});
      updateParams({ conversationId });
    }

    return () => {
      clearConversationDetailData();
      clearData();
    };
  }, [conversationId, updateParams, clearData, updateConversationDetailParam, clearConversationDetailData]);

  useEffect(() => {
    const latestMessage = conversation?.latestMessage;
    const currentUserId = authentication?.userDto.id;

    if (
      conversation
      && latestMessage
      && latestMessage.receiver.userId === currentUserId
      && !latestMessage.readAt
    ) {
      void markDirectMessageAsRead(conversation.id, latestMessage.id)
        .then(() => {
          useDirectMessageStore.getState().update(latestMessage.id, {
            readAt: new Date().toISOString(),
          });
          updateConversation(conversation.id, { hasUnread: false });
          void useNotificationStore.getState().fetch({ ignoreLoading: true });
        })
        .catch((error) => {
          console.error('Failed to mark direct message as read:', error);
        });
    }
  }, [authentication?.userDto.id, conversation, updateConversation]);

  // 과거 메시지를 붙인 직후에는 위치를 되돌려야 합니다.
  //
  // 이전에는 fetchMore 뒤 requestAnimationFrame 안에서 보정했는데, 그 콜백은
  // React 가 새 메시지를 DOM 에 반영하기 전에 실행됩니다. 그 시점의 scrollHeight
  // 는 아직 이전 값이라 높이 차이가 0 으로 계산되고 위치가 그대로 남았습니다.
  // useLayoutEffect 는 DOM 반영 뒤 화면에 그리기 전에 돌므로 깜빡임 없이 맞습니다.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const pending = pendingRestoreRef.current;
    if (!container || !pending) return;

    pendingRestoreRef.current = null;
    container.scrollTop = pending.top + (container.scrollHeight - pending.height);

    // 아래 자동 하단 스크롤 effect 가 이번 렌더에는 끼어들지 않게 합니다.
    skipAutoScrollRef.current = true;
    isLoadingMoreRef.current = false;
  }, [failedMessages.length, messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (messagesEndRef.current && !isLoadingMoreRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle scroll to load more messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = async () => {
      const { scrollTop } = container;

      // Check if scrolled to top (with 50px threshold)
      if (scrollTop < 50 && hasNext() && !loading && !isLoadingMoreRef.current) {
        isLoadingMoreRef.current = true;

        // 붙기 전 기준점만 남깁니다. 실제 보정은 새 메시지가 DOM 에 반영된 뒤
        // useLayoutEffect 에서 합니다.
        pendingRestoreRef.current = { height: container.scrollHeight, top: scrollTop };

        try {
          await fetchMore();
        } catch (error) {
          console.error('Failed to load more messages:', error);
          pendingRestoreRef.current = null;
          isLoadingMoreRef.current = false;
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasNext, loading, fetchMore]);

  // Group messages by date for date separators
  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear().toString().slice(2); // 24
    const month = date.getMonth() + 1; // 2
    const day = date.getDate(); // 11
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours < 12 ? '오전' : '오후';
    const displayHours = hours % 12 || 12;

    return `${year}. ${month}. ${day}. ${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
  };

  // Check if message should show profile (first message from user in sequence)
  const shouldShowProfile = (index: number, messagesArray: typeof messages): boolean => {
    if (index === 0) return true;
    const currentMessage = messagesArray[index];
    const previousMessage = messagesArray[index - 1];
    return currentMessage.sender.userId !== previousMessage.sender.userId;
  };

  // Get other user info (temporary - assumes first message sender who isn't me)
  const currentUserId = authentication?.userDto.id;
  const otherUser = conversation?.with;
  const otherUserName = otherUser?.name;

  const displayMessages = messages
    .slice()
    .sort((first, second) => first.messageSequence - second.messageSequence);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-[30px] py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          {/* Profile */}
          <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
            <img
              src={otherUser?.profileImageUrl || icProfileDefault}
              alt={`${otherUserName || 'User'} profile`}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Name */}
          <h2
              className="text-title1-sb text-white cursor-pointer hover:font-bold tracking-normal"
              onClick={() => navigate(`/profiles/${otherUser?.userId}`)}
          >{otherUserName}</h2>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900"
      >
        {loading && displayMessages.length === 0 && failedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
          </div>
        ) : displayMessages.length === 0 && failedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-body2-m text-gray-500">메시지가 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 py-[30px]">
            {/* Loading indicator for infinite scroll */}
            {loading && displayMessages.length > 0 && (
              <div className="flex justify-center py-2">
                <div className="w-6 h-6 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
              </div>
            )}

            {/* Date separator - Show for first message (oldest message) */}
            {displayMessages.length > 0 && (
              <div className="flex justify-center">
                <p className="text-body3-m text-gray-500">
                  {formatDateSeparator(displayMessages[0].createdAt)}
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex flex-col gap-3">
              {displayMessages.map((message, index) => {
                const isMine = message.sender.userId === currentUserId;

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isMine={isMine}
                    showProfile={shouldShowProfile(index, displayMessages)}
                    showReadStatus={index === displayMessages.length - 1}
                  />
                );
              })}
              {failedMessages.map((message) => (
                <FailedMessageBubble
                  key={message.id}
                  content={message.content}
                  createdAt={message.createdAt}
                  retrying={retryingMessageIds.has(message.id)}
                  onRetry={() => onRetryMessage(message.id)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <ConnectionBanner />
      <MessageInput onSend={onSendMessage} disabled={!isConnected} />
    </div>
  );
}
