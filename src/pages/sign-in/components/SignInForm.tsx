import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toAbsoluteApiUrl } from '@/lib/config/env';
import googleIcon from '@/assets/ic_google.svg';
import kakaoIcon from '@/assets/ic_kakao.svg';
import { featureFlags } from '@/lib/config/features';

interface SignInFormData {
  email: string;
  password: string;
}

type OAuthProvider = 'google' | 'kakao' | 'naver';

export default function SignInForm() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [redirectingProvider, setRedirectingProvider] =
    useState<OAuthProvider | null>(null);
  const { signIn } = useAuthStore();

  useEffect(() => {
    /**
     * OAuth Provider 화면에서 브라우저 뒤로가기로 돌아오면 BFCache가
     * 이동 직전의 React 상태까지 복원할 수 있습니다. 이때 남아 있는
     * redirectingProvider를 초기화하여 로그인 폼을 다시 활성화합니다.
     */
    const resetOAuthRedirectState = () => {
      setRedirectingProvider(null);
    };

    window.addEventListener('pageshow', resetOAuthRedirectState);

    return () => {
      window.removeEventListener('pageshow', resetOAuthRedirectState);
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>();

  const onSubmit = async (data: SignInFormData) => {
    setIsLoading(true);

    try {
      await signIn(data.email, data.password);
      toast.success('로그인에 성공했습니다');
      navigate('/contents');
    } catch (error) {
      console.error('Failed to sign in.', error);

      toast.error('로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (provider: OAuthProvider) => {
    /*
     * OAuth2 인가 요청은 Ajax가 아니라 브라우저 전체 이동으로 시작합니다.
     * Provider 화면으로 이동하기 전 모든 버튼을 비활성화하여 중복 인가 요청을
     * 만들지 않습니다.
     */
    if (redirectingProvider) return;

    setRedirectingProvider(provider);
    window.location.assign(
      toAbsoluteApiUrl(`/oauth2/authorization/${provider}`),
    );
  };

  const isSubmitting = isLoading || redirectingProvider != null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-5">
      {/* Email Field */}
      <div className="flex w-full flex-col gap-2.5">
        <Label htmlFor="email" className="px-1 text-body3-sb text-gray-500">
          이메일
        </Label>
        <div className="flex w-full flex-col gap-1.5">
          <Input
            id="email"
            type="email"
            placeholder="이메일 입력"
            className={cn(
              'h-[54px] rounded-xl border-[1.5px]',
              errors.email ? 'border-[#c93c3f]' : 'border-gray-800',
              'bg-[rgba(35,35,43,0.5)] px-5 py-3.5 text-body2-m-140 text-white placeholder:text-gray-400',
            )}
            {...register('email', {
              required: '이메일을 입력해주세요',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: '올바른 이메일 형식이 아닙니다',
              },
            })}
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="px-2 text-body3-m text-red-notification">{errors.email.message}</p>
          )}
        </div>
      </div>

      {/* Password Field */}
      <div className="flex w-full flex-col gap-2.5">
        <Label htmlFor="password" className="px-1 text-body3-sb text-gray-500">
          비밀번호
        </Label>
        <div className="flex w-full flex-col gap-1.5">
          <Input
            id="password"
            type="password"
            placeholder="비밀번호 입력"
            className={cn(
              'h-[54px] rounded-xl border-[1.5px]',
              errors.password ? 'border-[#c93c3f]' : 'border-gray-800',
              'bg-[rgba(35,35,43,0.5)] px-5 py-3.5 text-body2-m-140 text-white placeholder:text-gray-400',
            )}
            {...register('password', {
              required: '비밀번호를 입력해주세요',
            })}
            disabled={isSubmitting}
          />
          {errors.password && (
            <p className="px-2 text-body3-m text-red-notification">{errors.password.message}</p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="w-full pt-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-[54px] w-full rounded-xl bg-pink-500 text-body1-b text-white hover:bg-pink-600 disabled:bg-gray-800 disabled:text-gray-600"
        >
          {isLoading ? '로그인 중...' : '로그인'}
        </Button>
      </div>

      {featureFlags.passwordReset && (
        <div className="flex w-full justify-center text-center text-body2-m text-gray-500">
          <Link to="/reset-password" className="hover:text-gray-400">
            비밀번호를 잊으셨나요?
          </Link>
        </div>
      )}

      {featureFlags.oauth && (
        <>
          <div className="relative flex items-center gap-3 py-6">
            <div className="h-px flex-1 bg-[#212126]" />
            <span className="text-body2-m text-[#565666]">or</span>
            <div className="h-px flex-1 bg-[#212126]" />
          </div>

          <div className="flex w-full flex-col gap-5">
            <button
              type="button"
              onClick={() => handleLogin('google')}
              disabled={isSubmitting}
              className="flex h-[56px] w-full items-center justify-center gap-1 rounded-[200px] bg-[rgba(35,35,43,0.5)] text-body2-sb text-[#dfdfe2] transition-colors hover:bg-[rgba(45,45,53,0.5)] disabled:opacity-50"
            >
              <img src={googleIcon} alt="" className="size-5" />
              {redirectingProvider === 'google'
                ? '구글로 이동 중...'
                : '구글로 시작하기'}
            </button>

            <button
              type="button"
              onClick={() => handleLogin('kakao')}
              disabled={isSubmitting}
              className="flex h-[56px] w-full items-center justify-center gap-1 rounded-[200px] bg-[rgba(35,35,43,0.5)] text-body2-sb text-[#dfdfe2] transition-colors hover:bg-[rgba(45,45,53,0.5)] disabled:opacity-50"
            >
              <img src={kakaoIcon} alt="" className="size-5" />
              {redirectingProvider === 'kakao'
                ? '카카오로 이동 중...'
                : '카카오로 시작하기'}
            </button>

            <button
              type="button"
              onClick={() => handleLogin('naver')}
              disabled={isSubmitting}
              className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[200px] bg-[rgba(35,35,43,0.5)] text-body2-sb text-[#dfdfe2] transition-colors hover:bg-[rgba(45,45,53,0.5)] disabled:opacity-50"
            >
              <span
                className="flex size-5 items-center justify-center rounded-sm bg-[#03c75a] text-[13px] font-black leading-none text-white"
                aria-hidden="true"
              >
                N
              </span>
              {redirectingProvider === 'naver'
                ? '네이버로 이동 중...'
                : '네이버로 시작하기'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
