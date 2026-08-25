const STORAGE_KEY = 'mopl:oauth-account-link-return';
const RETURN_TARGET_TTL_MILLIS = 10 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface OAuthAccountLinkReturnTarget {
  userId: string;
  createdAt: number;
}

/**
 * OAuth 계정 연결 후 돌아올 본인 프로필 식별자를 저장합니다.
 *
 * Provider로 전체 페이지 이동을 수행하므로 React 메모리 상태가 아니라
 * 현재 탭에만 유지되는 sessionStorage를 사용합니다.
 */
export const saveOAuthAccountLinkReturnTarget = (userId: string) => {
  const target: OAuthAccountLinkReturnTarget = {
    userId,
    createdAt: Date.now(),
  };

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
};

/** 저장된 OAuth 계정 연결 복귀 정보를 제거합니다. */
export const clearOAuthAccountLinkReturnTarget = () => {
  window.sessionStorage.removeItem(STORAGE_KEY);
};

/**
 * 유효한 계정 연결 복귀 경로를 한 번만 반환합니다.
 *
 * sessionStorage가 조작되더라도 임의 URL로 이동하지 않도록 UUID만 허용하고,
 * 중단된 OAuth 흐름이 다음 로그인에 영향을 주지 않도록 10분 후 만료합니다.
 */
export const consumeOAuthAccountLinkReturnPath = (): string | null => {
  const serializedTarget = window.sessionStorage.getItem(STORAGE_KEY);
  clearOAuthAccountLinkReturnTarget();

  if (!serializedTarget) return null;

  try {
    const target = JSON.parse(serializedTarget) as Partial<OAuthAccountLinkReturnTarget>;
    const isValidUserId =
      typeof target.userId === 'string'
      && UUID_PATTERN.test(target.userId);
    const isFresh =
      typeof target.createdAt === 'number'
      && Date.now() - target.createdAt <= RETURN_TARGET_TTL_MILLIS;

    return isValidUserId && isFresh
      ? `/profiles/${target.userId}`
      : null;
  } catch {
    return null;
  }
};
