import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import googleIcon from '@/assets/ic_google.svg';
import kakaoIcon from '@/assets/ic_kakao.svg';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  getLinkedOAuthAccounts,
  startOAuthAccountLink,
  unlinkOAuthAccount,
} from '@/lib/api/users';
import { toAbsoluteApiUrl } from '@/lib/config/env';
import {
  clearOAuthAccountLinkReturnTarget,
  saveOAuthAccountLinkReturnTarget,
} from '@/lib/oauth/accountLinkReturn';
import type {
  ErrorResponse,
  OAuthAccountDto,
  OAuthProvider,
} from '@/lib/types';

const PROVIDERS: OAuthProvider[] = ['GOOGLE', 'KAKAO', 'NAVER'];

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  GOOGLE: 'Google',
  KAKAO: 'Kakao',
  NAVER: 'Naver',
};

const authorizationPathFor = (provider: OAuthProvider) =>
  `/oauth2/authorization/${provider.toLowerCase()}`;

const providerIcon = (provider: OAuthProvider) => {
  if (provider === 'GOOGLE') {
    return <img src={googleIcon} alt="" className="size-5" />;
  }

  if (provider === 'KAKAO') {
    return <img src={kakaoIcon} alt="" className="size-5" />;
  }

  return (
    <span
      className="flex size-5 items-center justify-center rounded-sm bg-[#03c75a] text-[13px] font-black leading-none text-white"
      aria-hidden="true"
    >
      N
    </span>
  );
};

const errorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<ErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
};

interface OAuthAccountSectionProps {
  userId: string;
}

/** 본인 프로필에서 OAuth 로그인 수단을 조회·연결·해제하는 영역입니다. */
export default function OAuthAccountSection({
  userId,
}: OAuthAccountSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<OAuthAccountDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionProvider, setActionProvider] =
    useState<OAuthProvider | null>(null);

  const accountByProvider = useMemo(
    () => new Map(accounts.map((account) => [account.provider, account])),
    [accounts],
  );
  const didLinkFail = searchParams.get('oauthLink') === 'failed';

  const dismissLinkFailure = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('oauthLink');
    setSearchParams(nextSearchParams, { replace: true });
  };

  useEffect(() => {
    /**
     * Provider 화면에서 브라우저 뒤로가기로 돌아오면 BFCache가 이동 직전의
     * 처리 상태를 복원할 수 있습니다. 중단된 연결 의도와 버튼 상태를 제거해
     * 사용자가 다시 연결을 시도할 수 있게 합니다.
     */
    const resetOAuthLinkState = () => {
      setActionProvider(null);
      clearOAuthAccountLinkReturnTarget();
    };

    window.addEventListener('pageshow', resetOAuthLinkState);

    return () => {
      window.removeEventListener('pageshow', resetOAuthLinkState);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const fetchAccounts = async () => {
      setIsLoading(true);

      try {
        const linkedAccounts = await getLinkedOAuthAccounts(userId);

        if (isActive) {
          setAccounts(linkedAccounts);
        }
      } catch (error) {
        console.error('Failed to fetch linked OAuth accounts:', error);

        if (isActive) {
          toast.error(
            errorMessage(error, '소셜 계정 연결 정보를 불러오지 못했습니다.'),
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void fetchAccounts();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const handleLink = async (provider: OAuthProvider) => {
    if (actionProvider) return;

    setActionProvider(provider);

    try {
      const response = await startOAuthAccountLink(userId, provider);
      const expectedPath = authorizationPathFor(provider);

      if (response.authorizationPath !== expectedPath) {
        throw new Error('Unexpected OAuth authorization path');
      }

      saveOAuthAccountLinkReturnTarget(userId);
      window.location.assign(toAbsoluteApiUrl(response.authorizationPath));
    } catch (error) {
      console.error('Failed to start OAuth account link:', error);
      toast.error(
        errorMessage(error, `${PROVIDER_LABEL[provider]} 연결을 시작하지 못했습니다.`),
      );
      setActionProvider(null);
    }
  };

  const handleUnlink = async (provider: OAuthProvider) => {
    if (actionProvider) return;

    const confirmed = window.confirm(
      `${PROVIDER_LABEL[provider]} 계정 연결을 해제하시겠습니까?`,
    );

    if (!confirmed) return;

    setActionProvider(provider);

    try {
      await unlinkOAuthAccount(userId, provider);
      setAccounts((currentAccounts) =>
        currentAccounts.filter((account) => account.provider !== provider),
      );
      toast.success(`${PROVIDER_LABEL[provider]} 계정 연결을 해제했습니다.`);
    } catch (error) {
      console.error('Failed to unlink OAuth account:', error);
      toast.error(
        errorMessage(error, `${PROVIDER_LABEL[provider]} 연결을 해제하지 못했습니다.`),
      );
    } finally {
      setActionProvider(null);
    }
  };

  return (
    <section className="mb-[60px] rounded-2xl border border-gray-800 bg-gray-950/40 p-6">
      <div className="mb-5">
        <h2 className="text-title1-sb text-gray-100">소셜 계정 연결</h2>
        <p className="mt-1 text-body3-m text-gray-500">
          연결된 소셜 계정으로도 동일한 MOPL 계정에 로그인할 수 있습니다.
        </p>
      </div>

      {didLinkFail && (
        <div
          role="alert"
          className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-notification/40 bg-red-notification/10 px-4 py-3"
        >
          <p className="text-body3-m text-red-notification">
            소셜 계정을 연결하지 못했습니다. 이미 다른 MOPL 계정에 연결된
            소셜 계정인지 확인해주세요.
          </p>
          <button
            type="button"
            onClick={dismissLinkFailure}
            className="shrink-0 text-body3-sb text-gray-300 hover:text-white"
          >
            확인
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-28 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const linkedAccount = accountByProvider.get(provider);
            const isProcessing = actionProvider === provider;

            return (
              <article
                key={provider}
                className="flex min-h-32 flex-col justify-between rounded-xl border border-gray-800 bg-gray-900/60 p-4"
              >
                <div className="flex items-center gap-2">
                  {providerIcon(provider)}
                  <span className="text-body1-sb text-gray-100">
                    {PROVIDER_LABEL[provider]}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p
                      className={
                        linkedAccount
                          ? 'text-body3-sb text-green-400'
                          : 'text-body3-m text-gray-500'
                      }
                    >
                      {linkedAccount ? '연결됨' : '연결되지 않음'}
                    </p>
                    {linkedAccount && (
                      <p className="mt-1 text-[11px] text-gray-600">
                        {new Date(linkedAccount.connectedAt).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                  </div>

                  {linkedAccount ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionProvider != null}
                      onClick={() => handleUnlink(provider)}
                      className="border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                      {isProcessing ? '해제 중...' : '해제'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={actionProvider != null}
                      onClick={() => handleLink(provider)}
                      className="bg-pink-500 text-white hover:bg-pink-600"
                    >
                      {isProcessing ? '이동 중...' : '연결'}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
