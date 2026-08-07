import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import useContentDetailStore from '@/lib/stores/useContentDetailStore';
import useWatchingSessionStore from '@/lib/stores/useWatchingSessionStore';
import useChatMessageStore from '@/lib/stores/useChatMessageStore';
import {useWebSocketStore} from '@/lib/stores/websocketStore';
import {useAuthStore} from '@/lib/stores/useAuthStore';
import ContentInfo from './components/ContentInfo';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import WatcherListItem from './components/WatcherListItem';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type {ContentChatDto, WatchingSessionChange} from "@/lib/types";
import { featureFlags } from '@/lib/config/features';

export default function ContentDetailPage() {
  const { contentId } = useParams<{ contentId: string }>();
  const [isConnecting, setIsConnecting] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Stores
  const { data: content, loading: contentLoading, updateParams: updateContentParams, clear: clearContent } = useContentDetailStore();
  const { data: watchingSessions, updateParams: updateWatchingSessionParams, add: addWatchingSession, delete: removeWatchingSession } = useWatchingSessionStore();
  const { messages, addMessage, clearMessages } = useChatMessageStore();
  const { connect, subscribe, unsubscribe, isConnected, send } = useWebSocketStore();
  const accessToken = useAuthStore((state) => state.data?.accessToken);

  // 콘텐츠 상세 페칭
  useEffect(() => {
    if (contentId) {
      updateContentParams({ contentId });
    }

    return () => clearContent(); // Cleanup on unmount
  }, [contentId, updateContentParams, clearContent]);

  // 시청자 목록 페칭
  useEffect(() => {
    if (contentId) {
      updateWatchingSessionParams({ contentId });
    }
  }, [contentId, updateWatchingSessionParams]);

  // WebSocket 연결
  //
  // 구독과 분리해 둔다. 한 effect 에서 연결과 구독을 함께 처리하면 connect() 가 바꾼
  // isConnected 때문에 그 effect 가 다시 실행되고, cleanup 의 unsubscribe 와 본문의
  // subscribe 가 한 번 더 돌면서 서버가 LEAVE·JOIN 을 실제로 브로드캐스트한다.
  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setIsConnecting(true);

    connect(accessToken)
      .catch((error) => {
        console.error('WebSocket connect failed:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsConnecting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, connect]);

  // 시청 토픽·채팅 토픽 구독
  //
  // 연결이 끊긴 동안에는 아무것도 하지 않고 cleanup 도 남기지 않는다. 연결이 성립된
  // 뒤 한 번만 구독하므로 입장당 JOIN 하나, 퇴장당 LEAVE 하나로 떨어진다.
  // isConnected 를 의존성에 그대로 두는 이유는 재연결 때문이다. websocketStore 는
  // 소켓이 닫히면 구독 Map 을 비우므로, 화면이 다시 구독해 주지 않으면 연결은
  // 살아났는데 메시지가 오지 않는 상태가 된다.
  useEffect(() => {
    if (!contentId || !isConnected) return;

    const watchDestination = `/sub/contents/${contentId}/watch`;
    const chatDestination = `/sub/contents/${contentId}/chat`;

    subscribe(watchDestination, (watchingSessionChange: WatchingSessionChange) => {
      // 시청자 입장/퇴장 이벤트 처리
      if (watchingSessionChange.type === 'JOIN') {
        addWatchingSession(watchingSessionChange.watchingSessionDto);
      } else if (watchingSessionChange.type === 'LEAVE') {
        removeWatchingSession(watchingSessionChange.watchingSessionDto.id);
      }
    });

    if (featureFlags.contentChat) {
      subscribe(chatDestination, (message: ContentChatDto) => {
        addMessage(message);
      });
    }

    // 페이지 이탈 시 구독 해제
    return () => {
      unsubscribe(watchDestination);
      if (featureFlags.contentChat) {
        unsubscribe(chatDestination);
      }
      clearMessages();
    };
  }, [
    contentId,
    isConnected,
    subscribe,
    unsubscribe,
    addWatchingSession,
    removeWatchingSession,
    addMessage,
    clearMessages,
  ]);

  // 채팅 메시지 전송 핸들러
  const handleSendMessage = (message: string) => {
    if (!contentId) return;

    try {
      send(`/pub/contents/${contentId}/chat`, {
        content: message,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }

    console.log('Send message:', message, 'to', `/pub/contents/${contentId}/chat`);
  };

  // 채팅 스크롤 자동 하단 이동
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 로딩 상태
  if (contentLoading || isConnecting) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-body2-m text-gray-500">콘텐츠를 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 시청자 목록 (중복 제거)
  const watchers = watchingSessions
    .map((session) => session.watcher)
    .filter((watcher, index, self) => self.findIndex((w) => w.userId === watcher.userId) === index);

  return (
    <div className="flex flex-col lg:flex-row w-full h-full bg-background">
      {/* 좌측: 콘텐츠 정보 - 비율 기반 (약 30%) */}
      <div className="w-full lg:w-[30%] lg:min-w-[400px] lg:max-w-[526px] h-auto lg:h-full overflow-y-auto shrink-0">
        <div className="p-8 lg:pl-[50px] lg:pr-[50px] lg:pt-20 lg:pb-20">
          <ContentInfo content={content}/>
        </div>
      </div>

      {featureFlags.contentChat && (
        <div className="flex-1 min-w-0 h-auto lg:h-full flex items-stretch justify-center p-4 lg:py-20 lg:px-8">
          <div className="w-full h-full flex flex-col backdrop-blur-[25px] bg-[rgba(46,46,56,0.4)] border border-[#212126] rounded-2xl overflow-hidden">
            <div className="px-10 pt-[30px] pb-[10px]">
              <div className="flex items-center gap-1.5">
                <h2 className="text-title1-b text-gray-50">실시간 채팅</h2>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-pink-500" />
                  <span className="text-body3-b text-gray-400">
                    {watchers.length.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-10 py-[10px]">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-body2-m text-gray-500">
                    채팅 메시지가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-[10px]">
                  {messages.map((message, index) => (
                    <ChatMessage key={index} message={message} />
                  ))}
                </div>
              )}
            </div>

            <div className="px-10 py-[10px]">
              <ChatInput onSendMessage={handleSendMessage} disabled={!isConnected} />
            </div>
          </div>
        </div>
      )}

      {/* 우측: 시청자 목록 - 비율 기반 (약 15-20%) */}
      <div className="w-full lg:w-[18%] lg:min-w-[220px] lg:max-w-[270px] h-auto lg:h-full overflow-y-auto lg:border-l border-t lg:border-t-0 border-gray-800 shrink-0">
        <div className="px-[30px] py-5">
          {/* 헤더 */}
          <div className="py-2 mb-1.5">
            <h3 className="text-body3-b text-gray-300">현재 시청자 목록</h3>
          </div>

          {/* 시청자 리스트 */}
          <div className="space-y-0">
            {watchers.length === 0 ? (
              <p className="text-body3-m text-gray-500 py-2">시청자가 없습니다.</p>
            ) : (
              watchers.map((watcher) => <WatcherListItem key={watcher.userId} user={watcher} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
