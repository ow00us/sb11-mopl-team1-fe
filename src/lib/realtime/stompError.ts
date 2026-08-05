/**
 * STOMP ERROR 프레임 해석
 *
 * 서버는 WebSocketStompErrorHandler 에서 예외를 REST 와 같은 ErrorResponse JSON 으로
 * 직렬화해 ERROR 프레임 본문에 담습니다. 덕분에 HTTP 와 WebSocket 두 채널이 같은
 * 파싱 로직을 씁니다.
 *
 * 계약: openapi/realtime-contract.md
 */

import type { IFrame } from '@stomp/stompjs';
import type { ErrorResponse } from '@/lib/types';

/** 서버 ErrorCode 열거형의 코드 값입니다. */
export const STOMP_ERROR_CODE = {
  /** 토큰이 없거나 유효하지 않습니다. */
  UNAUTHORIZED: 'COMMON_401_1',
  /** 허용되지 않은 목적지로 구독·송신했습니다. */
  FORBIDDEN: 'COMMON_403_1',
  INTERNAL: 'COMMON_500_1',
} as const;

/** 서버 응답을 파싱하지 못했을 때 쓰는 코드입니다. 서버 코드와 구분됩니다. */
export const CLIENT_STOMP_ERROR_CODE = 'CLIENT_STOMP_ERROR';

const hasErrorResponseShape = (value: unknown): value is ErrorResponse =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ErrorResponse).errorCode === 'string' &&
  typeof (value as ErrorResponse).message === 'string';

/**
 * ERROR 프레임 본문을 ErrorResponse 로 해석합니다.
 *
 * 본문이 비어 있거나 JSON 이 아닌 경우(브로커가 직접 만든 프레임, 직렬화 실패)에도
 * 호출부가 분기할 수 있도록 항상 ErrorResponse 를 돌려줍니다.
 */
export const parseStompErrorFrame = (frame: IFrame): ErrorResponse => {
  try {
    const parsed: unknown = JSON.parse(frame.body);
    if (hasErrorResponseShape(parsed)) {
      return parsed;
    }
  } catch {
    // 아래 fallback 으로 넘어갑니다.
  }

  return {
    exceptionName: 'StompError',
    errorCode: CLIENT_STOMP_ERROR_CODE,
    message: frame.headers?.message || '실시간 연결에서 오류가 발생했습니다.',
    details: {},
  };
};

/** 재인증하면 해소될 수 있는 오류입니다. */
export const isUnauthorized = (error: ErrorResponse): boolean =>
  error.errorCode === STOMP_ERROR_CODE.UNAUTHORIZED;

/**
 * 재시도해도 같은 결과가 나오는 오류입니다.
 *
 * 목적지가 계약에 없거나 사용자가 해당 리소스의 참여자가 아닌 경우이므로,
 * 재연결을 반복하면 5초마다 같은 실패를 되풀이할 뿐입니다.
 */
export const isForbidden = (error: ErrorResponse): boolean =>
  error.errorCode === STOMP_ERROR_CODE.FORBIDDEN;
