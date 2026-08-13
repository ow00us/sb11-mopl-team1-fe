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
  // STOMP /pub/contents/{contentId}/watch/heartbeat
  //
  // 아직 StompDestinationAuthorizationInterceptor 의 허용 목적지에 없습니다.
  // 켜면 서버가 COMMON_403_1 ERROR 프레임을 보내고 연결을 닫으므로, 시청자
  // 목록과 채팅까지 함께 끊깁니다. 목적지 허용과 만료 시각 정책이 백엔드에
  // 병합된 뒤 켭니다.
  watchHeartbeat: false,
} as const;
