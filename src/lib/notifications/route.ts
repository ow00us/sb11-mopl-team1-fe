import type { NotificationDto } from '@/lib/types';

/**
 * 알림이 가리키는 화면 경로를 만듭니다.
 *
 * 백엔드는 알림마다 type 과 resourceId 를 함께 내려줍니다. resourceId 가 무엇을
 * 가리키는지는 type 마다 다르며, NotificationEventMapper 기준으로 아래와 같습니다.
 *
 *   FOLLOW                 팔로워 userId
 *   DIRECT_MESSAGE         conversationId
 *   PLAYLIST_SUBSCRIPTION  playlistId
 *
 * 모르는 type 이거나 값이 비어 있으면 null 을 돌려줍니다. 호출부는 이 경우
 * 이동하지 않고 읽음 처리만 합니다. 백엔드가 알림 유형을 추가해도 화면이
 * 깨지지 않게 하려는 것입니다.
 */
export function notificationRoute(notification: NotificationDto): string | null {
  const { type, resourceId } = notification;

  if (!type || !resourceId) return null;

  switch (type) {
    case 'FOLLOW':
      return `/profiles/${resourceId}`;
    case 'DIRECT_MESSAGE':
      return `/conversations/${resourceId}`;
    case 'PLAYLIST_SUBSCRIPTION':
      return `/playlists/${resourceId}`;
    default:
      return null;
  }
}
