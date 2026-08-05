/**
 * 환경 설정 단일 진입점
 *
 * 백엔드 주소를 가리키는 값이 REST·WebSocket·SSE·OAuth2 네 곳에 흩어져 있었고,
 * 그중 셋은 앱 base path 를 뜻하는 VITE_PUBLIC_PATH 를 대신 쓰고 있었습니다.
 * 코스 프로토타입은 FE 와 백엔드가 모두 /sb/mopl 아래여서 두 값이 같았지만,
 * Nginx 뒤에 각각 배포하면 REST 만 동작하고 실시간 연결이 FE 호스트로 붙습니다.
 */

/**
 * 백엔드 주소입니다.
 *
 * 빈 값이면 같은 origin 의 상대 경로로 요청합니다. 개발에서는 vite.config.ts 의
 * 프록시가 /api, /ws, /oauth2 를 백엔드로 넘기므로 비워 둡니다.
 *
 * 예) ''  ·  '/sb/mopl'  ·  'https://api.example.com'
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '';

/**
 * 앱을 서브 경로에 배포할 때의 base path 입니다. vite.config.ts 의 base 와 같은 값을 씁니다.
 *
 * 예) ''  ·  '/sb/mopl'
 */
export const APP_BASE_PATH: string = import.meta.env.VITE_PUBLIC_PATH || '';

const ABSOLUTE_URL = /^https?:\/\//i;

/**
 * 브라우저를 직접 이동시킬 때 쓰는 절대 URL 을 만듭니다.
 *
 * OAuth2 인가 요청처럼 location.href 에 넣는 값은 절대 URL 이어야 합니다.
 * API_BASE_URL 이 이미 절대 URL 이면 그대로 쓰고, 상대 경로이면 현재 origin 을 붙입니다.
 */
export const toAbsoluteApiUrl = (path: string): string =>
  ABSOLUTE_URL.test(API_BASE_URL)
    ? `${API_BASE_URL}${path}`
    : `${window.location.origin}${API_BASE_URL}${path}`;
