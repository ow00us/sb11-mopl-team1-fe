/**
 * 백엔드 develop에 병합되고 시연 환경에서 검증된 기능만 노출합니다.
 *
 * 이 값은 중간발표용 최소 흐름의 안전장치입니다. 대응 API가 준비되면
 * 관련 이슈에서 계약과 함께 true로 전환합니다.
 */
export const featureFlags = {
  // 대응 API 없음. 백엔드에 재설정 엔드포인트가 없습니다.
  passwordReset: false,
  // 대응 API 없음. 백엔드에 OAuth2 설정이 없습니다.
  oauth: false,
  // GET /api/users (관리자 전용)
  adminUsers: true,
  // GET /api/sse (text/event-stream)
  sse: true,
  // STOMP /pub/contents/{contentId}/chat
  contentChat: true,
  // STOMP /pub/conversations/{conversationId}/direct-messages
  directMessageSend: true,
} as const;
