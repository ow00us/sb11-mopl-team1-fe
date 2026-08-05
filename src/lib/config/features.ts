/**
 * 백엔드 develop에 병합되고 시연 환경에서 검증된 기능만 노출합니다.
 *
 * 이 값은 중간발표용 최소 흐름의 안전장치입니다. 대응 API가 준비되면
 * 관련 이슈에서 계약과 함께 true로 전환합니다.
 */
export const featureFlags = {
  passwordReset: false,
  oauth: false,
  adminUsers: false,
  sse: false,
  contentChat: false,
  directMessageSend: false,
} as const;
