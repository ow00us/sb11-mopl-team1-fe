/**
 * Type Exports
 *
 * Centralized exports for commonly used types
 */

// Export commonly used schema types
import type { components, operations } from './api';

// User types
export type UserDto = components['schemas']['UserDto'];
export type UserCreateRequest = components['schemas']['UserCreateRequest'];
export type UserUpdateRequest = components['schemas']['UserUpdateRequest'];
export type UserRoleUpdateRequest = components['schemas']['UserRoleUpdateRequest'];
export type UserLockUpdateRequest = components['schemas']['UserLockUpdateRequest'];
export type UserSummary = components['schemas']['UserSummary'];
export type OAuthAccountDto = components['schemas']['OAuthAccountDto'];
export type OAuthLinkStartResponse = components['schemas']['OAuthLinkStartResponse'];
export type OAuthProvider = OAuthAccountDto['provider'];
export type LocalCredentialEmailVerificationRequest =
  components['schemas']['LocalCredentialEmailVerificationRequest'];
export type LocalCredentialRegistrationRequest =
  components['schemas']['LocalCredentialRegistrationRequest'];

// Auth types
export type SignInRequest = components['schemas']['SignInRequest'];
export type JwtDto = components['schemas']['JwtDto'];
export type ResetPasswordRequest = components['schemas']['ResetPasswordRequest'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];

// Content types
export type ContentDto = components['schemas']['ContentDto'];
export type ContentCreateRequest = components['schemas']['ContentCreateRequest'];
export type ContentUpdateRequest = components['schemas']['ContentUpdateRequest'];
export type ContentSummary = components['schemas']['ContentSummary'];
export type ContentChatDto = {
  sender: UserSummary;
  content: string;
};

// Playlist types
export type PlaylistDto = components['schemas']['PlaylistDto'];
export type PlaylistCreateRequest = components['schemas']['PlaylistCreateRequest'];
export type PlaylistUpdateRequest = components['schemas']['PlaylistUpdateRequest'];

// Review types
export type ReviewDto = components['schemas']['ReviewDto'];
export type ReviewCreateRequest = components['schemas']['ReviewCreateRequest'];
export type ReviewUpdateRequest = components['schemas']['ReviewUpdateRequest'];

// Conversation & Direct Message types
export type ConversationDto = components['schemas']['ConversationDto'];
export type ConversationCreateRequest = components['schemas']['ConversationCreateRequest'];
export type DirectMessageDto = components['schemas']['DirectMessageDto'];
export type DirectMessageSendRequest = {
  clientMessageId: string;
  content: string;
};
export type DirectMessageReadEvent = {
  conversationId: string;
  readerId: string;
  /** 서버 PR #405의 현재 필드명입니다. */
  lastReadMessageId?: string;
  /** 도메인 전달 계약에서 사용하는 호환 필드명입니다. */
  directMessageId?: string;
  lastReadMessageSequence: number;
  readAt: string;
};
export type DirectMessageRealtimeEvent =
  | { type: 'DIRECT_MESSAGE_CREATED'; data: DirectMessageDto }
  | { type: 'DIRECT_MESSAGE_READ'; data: DirectMessageReadEvent };

// Follow types
export type FollowDto = components['schemas']['FollowDto'];
export type FollowRequest = components['schemas']['FollowRequest'];
export type FollowerCountResponse = components['schemas']['FollowerCountResponse'];
export type FollowUserItemDto = components['schemas']['FollowUserItemDto'];
export type FollowRecommendationItemDto = components['schemas']['FollowRecommendationItemDto'];

// Playlist subscriber types
export type SubscriberItemDto = components['schemas']['SubscriberItemDto'];

// Notification types
export type NotificationDto = components['schemas']['NotificationDto'];

// Watching Session types
export type WatchingSessionDto = components['schemas']['WatchingSessionDto'];
/**
 * `/sub/contents/{contentId}/watch` 로 방송되는 페이로드입니다.
 *
 * 서버 `WatchingSessionChange` 레코드의 컴포넌트 이름이 그대로 JSON 키가 되므로
 * 필드명이 `watchingSessionDto` 입니다. STOMP 페이로드는 OpenAPI 스키마에 없어
 * 생성 타입으로 검증되지 않으니, 서버 레코드가 바뀌면 여기도 함께 고쳐야 합니다.
 */
export type WatchingSessionChange = {
  type: 'JOIN' | 'LEAVE';
  watchingSessionDto: WatchingSessionDto;
  watcherCount: number;
}

// Cursor pagination types
export type CursorResponseUserDto = components['schemas']['CursorResponseUserDto'];
export type CursorResponseUserSummary = components['schemas']['CursorResponseUserSummary'];
export type CursorResponseContentDto = components['schemas']['CursorResponseContentDto'];
export type CursorResponsePlaylistDto = components['schemas']['CursorResponsePlaylistDto'];
export type CursorResponseReviewDto = components['schemas']['CursorResponseReviewDto'];
export type CursorResponseConversationDto = components['schemas']['CursorResponseConversationDto'];
export type CursorResponseDirectMessageDto = components['schemas']['CursorResponseDirectMessageDto'];
export type CursorResponseNotificationDto = components['schemas']['CursorResponseNotificationDto'];
export type CursorResponseWatchingSessionDto = components['schemas']['CursorResponseWatchingSessionDto'];
export type CursorResponseFollowUserItemDto = components['schemas']['CursorResponseFollowUserItemDto'];
export type CursorResponseFollowRecommendationItemDto =
  components['schemas']['CursorResponseFollowRecommendationItemDto'];
export type CursorResponseSubscriberItemDto = components['schemas']['CursorResponseSubscriberItemDto'];

export type CursorResponse =
    CursorResponseUserDto
    | CursorResponseContentDto
    | CursorResponsePlaylistDto
    | CursorResponseReviewDto
    | CursorResponseConversationDto
    | CursorResponseDirectMessageDto
    | CursorResponseNotificationDto
    | CursorResponseWatchingSessionDto
    | CursorResponseFollowUserItemDto
    | CursorResponseFollowRecommendationItemDto
    | CursorResponseSubscriberItemDto;


// Error types
export type ErrorResponse = components['schemas']['ErrorResponse'];

// Common enums and constants
export type UserRole = 'USER' | 'ADMIN';
export type ContentType = 'movie' | 'tvSeries' | 'sport';
export type SortDirection = 'ASCENDING' | 'DESCENDING';
export type NotificationLevel = 'INFO' | 'WARNING' | 'ERROR';


/**
 * API Query Parameter Types
 *
 * These types are extracted from operations for easier use in API modules
 */

// User query params
export type FindUsersParams = operations['findUsers']['parameters']['query'];
export type SearchUsersParams = operations['searchUsers']['parameters']['query'];

// Content query params
export type FindContentsParams = operations['findContents']['parameters']['query'];

// Playlist query params
export type FindPlaylistsParams = operations['findPlaylists']['parameters']['query'];
export type FindPopularPlaylistsParams =
  operations['findPopularPlaylists']['parameters']['query'];

// Review query params
export type FindReviewsParams = operations['findReviews']['parameters']['query'];

// Conversation & DM query params
export type FindConversationsParams = operations['findConversations']['parameters']['query'];
export type FindDmsParams = operations['findDms']['parameters']['query'];

// Notification query params
export type GetNotificationsParams = operations['getNotifications']['parameters']['query'];

// Watching session query params
export type FindWatchingSessionsByContentParams =
  operations['findWatchingSessionsByContent']['parameters']['query'];

// Follow query params
export type GetFollowersParams = operations['getFollowers']['parameters']['query'];
export type GetFollowingsParams = operations['getFollowings']['parameters']['query'];
export type GetFollowRecommendationsParams =
  operations['getFollowRecommendations']['parameters']['query'];

// Playlist subscriber query params
export type GetPlaylistSubscribersParams =
  operations['getPlaylistSubscribers']['parameters']['query'];

export type CursorParams =
    FindUsersParams
    | FindContentsParams
    | FindPlaylistsParams
    | FindPopularPlaylistsParams
    | FindReviewsParams
    | FindConversationsParams
    | FindDmsParams
    | GetNotificationsParams
    | FindWatchingSessionsByContentParams
    | GetFollowersParams
    | GetFollowingsParams
    | GetFollowRecommendationsParams
    | GetPlaylistSubscribersParams;
