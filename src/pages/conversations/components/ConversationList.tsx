import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import useConversationStore from '@/lib/stores/useConversationStore';
import { useSseStore } from '@/lib/stores/sseStore';
import { getConversationById } from '@/lib/api/conversations';
import ConversationItem from './ConversationItem';
import icSearch from '@/assets/ic_search.svg';
import type { DirectMessageDto } from '@/lib/types';
import { featureFlags } from '@/lib/config/features';
import { MessageSquarePlus } from 'lucide-react';
import NewConversationDialog from './NewConversationDialog';
import { useAuthStore } from '@/lib/stores/useAuthStore';

interface ConversationListProps {
  selectedConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
}

export default function ConversationList({ selectedConversationId, onSelectConversation }: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const { data: conversations, loading, fetch, fetchMore, hasNext, updateParams } = useConversationStore();
  const { subscribe, unsubscribe, isConnected } = useSseStore();
  const currentUserId = useAuthStore((state) => state.data?.userDto.id);
  const hasConnectedRef = useRef(false);
  const disconnectedAfterConnectRef = useRef(false);

  // Infinite scroll sentinel
  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  });

  // Initial fetch
  useEffect(() => {
    fetch();
  }, [fetch]);

  // SSE 재접속 뒤에는 놓친 이벤트를 추측하지 않고 서버 hasUnread로 복구합니다.
  useEffect(() => {
    if (!isConnected) {
      if (hasConnectedRef.current) disconnectedAfterConnectRef.current = true;
      return;
    }

    if (hasConnectedRef.current && disconnectedAfterConnectRef.current) {
      void fetch({ ignoreLoading: true });
    }

    hasConnectedRef.current = true;
    disconnectedAfterConnectRef.current = false;
  }, [fetch, isConnected]);

  // Subscribe to direct messages SSE
  useEffect(() => {
    if (!featureFlags.sse) return;

    subscribe('direct-messages', async (message: DirectMessageDto) => {
      const { conversationId } = message;
      const currentConversations = useConversationStore.getState().data;

      // Check if conversation exists in current list
      const existingConversation = currentConversations.find(
        (conv) => conv.id === conversationId
      );

      if (existingConversation) {
        // Update existing conversation with new message
        const isIncoming = message.receiver.userId === currentUserId;
        useConversationStore.getState().update(conversationId, {
          latestMessage: message,
          // 비활성 대화의 수신 메시지만 미읽음으로 올립니다. 현재 대화는 읽음
          // API 성공 처리자가 false로 내리며, 그 전에는 기존 서버 상태를 보존합니다.
          hasUnread: isIncoming && selectedConversationId !== conversationId
            ? true
            : existingConversation.hasUnread,
        });
      } else {
        // Fetch full conversation data and add to list
        try {
          const conversation = await getConversationById(conversationId);
          useConversationStore.getState().add(conversation);
        } catch (error) {
          console.error('Failed to fetch conversation:', error);
        }
      }
    });

    return () => {
      unsubscribe('direct-messages');
    };
  }, [currentUserId, subscribe, unsubscribe, selectedConversationId]);

  // Fetch more when sentinel is in view
  useEffect(() => {
    if (inView && hasNext() && !loading) {
      fetchMore();
    }
  }, [inView, hasNext, loading, fetchMore]);

  // Handle search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    updateParams({ keywordLike: value });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <h1 className="text-title1-sb text-gray-100">메시지</h1>
        <button
          type="button"
          onClick={() => setIsNewConversationOpen(true)}
          className="flex size-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          aria-label="새 대화 시작"
        >
          <MessageSquarePlus className="size-5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-6 py-3.5 border-b border-gray-800">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="검색어를 입력하세요"
            className="w-full h-[42px] pl-5 pr-12 py-1 bg-gray-800/50 rounded-[50px] text-body3-m text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-700"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6">
            <img src={icSearch} alt="search" className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
        {conversations.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-body3-m text-gray-500">대화 목록이 없습니다.</p>
          </div>
        ) : (
          <>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
              />
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {hasNext() && !loading && <div ref={sentinelRef} className="h-px" />}
          </>
        )}
      </div>

      <NewConversationDialog
        open={isNewConversationOpen}
        onOpenChange={setIsNewConversationOpen}
      />
    </div>
  );
}
