import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  registerLocalCredential,
  sendLocalCredentialEmailVerification,
} from '@/lib/api/users';
import useAuthStore from '@/lib/stores/useAuthStore';
import useUserProfileStore from '@/lib/stores/useUserProfileStore';
import type { ErrorResponse } from '@/lib/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_SPECIAL_CHARACTERS = '!@#$%^&*()_+-={}[]|:;"\'<>,.?/~`';

const isPasswordValid = (value: string): boolean =>
  /[A-Za-z]/.test(value) &&
  /\d/.test(value) &&
  [...value].some((character) =>
    PASSWORD_SPECIAL_CHARACTERS.includes(character),
  ) &&
  [...value].every(
    (character) =>
      /[A-Za-z\d]/.test(character) ||
      PASSWORD_SPECIAL_CHARACTERS.includes(character),
  );

const serverErrorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<ErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
};

interface LocalCredentialSectionProps {
  userId: string;
}

/** OAuth 전용 사용자가 이메일·비밀번호 로그인 수단을 추가하는 영역입니다. */
export default function LocalCredentialSection({
  userId,
}: LocalCredentialSectionProps) {
  const [email, setEmail] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid =
    normalizedEmail.length <= 100 && EMAIL_PATTERN.test(normalizedEmail);

  const handleEmailChange = (value: string) => {
    setEmail(value);

    if (value.trim().toLowerCase() !== verificationEmail) {
      setVerificationEmail(null);
      setVerificationCode('');
    }
  };

  const handleSendVerification = async () => {
    if (!isEmailValid || isSending) {
      toast.error('올바른 이메일을 입력해주세요.');
      return;
    }

    setIsSending(true);

    try {
      await sendLocalCredentialEmailVerification(userId, {
        email: normalizedEmail,
      });
      setVerificationEmail(normalizedEmail);
      toast.success('인증 코드를 발송했습니다. 이메일을 확인해주세요.');
    } catch (error) {
      console.error('Failed to send local credential verification:', error);
      toast.error(
        serverErrorMessage(error, '인증 코드를 발송하지 못했습니다.'),
      );
    } finally {
      setIsSending(false);
    }
  };

  const validateRegistration = (): string | null => {
    if (verificationEmail !== normalizedEmail) {
      return '현재 이메일로 인증 코드를 먼저 요청해주세요.';
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      return '이메일로 받은 6자리 인증 코드를 입력해주세요.';
    }

    if (password.length < 8 || password.length > 72) {
      return '비밀번호는 8자 이상 72자 이하로 입력해주세요.';
    }

    if (!isPasswordValid(password)) {
      return '비밀번호에는 영문, 숫자, 특수문자가 각각 하나 이상 필요합니다.';
    }

    if (password !== passwordConfirmation) {
      return '비밀번호가 일치하지 않습니다.';
    }

    return null;
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationMessage = validateRegistration();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsRegistering(true);

    try {
      await registerLocalCredential(userId, {
        email: normalizedEmail,
        verificationCode,
        password,
      });

      const currentUser = useAuthStore.getState().data?.userDto;
      if (currentUser?.id === userId) {
        const updatedUser = {
          ...currentUser,
          email: normalizedEmail,
        };

        useAuthStore.getState().update({ userDto: updatedUser });
        useUserProfileStore.getState().update(updatedUser);
      }

      toast.success('이메일·비밀번호 로그인 수단을 추가했습니다.');
    } catch (error) {
      console.error('Failed to register local credential:', error);
      toast.error(
        serverErrorMessage(error, '로그인 수단을 추가하지 못했습니다.'),
      );
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <section className="mb-[60px] rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
      <div className="mb-5">
        <h2 className="text-title1-sb text-gray-100">이메일 로그인 추가</h2>
        <p className="mt-1 text-body3-m text-gray-500">
          이메일을 인증하고 비밀번호를 설정하면 소셜 계정 없이도 로그인할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleRegister} className="max-w-2xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="local-credential-email" className="text-gray-400">
            이메일
          </Label>
          <div className="flex gap-2">
            <Input
              id="local-credential-email"
              type="email"
              value={email}
              maxLength={100}
              autoComplete="email"
              placeholder="user@example.com"
              disabled={isRegistering}
              onChange={(event) => handleEmailChange(event.target.value)}
              className="h-12 border-gray-800 bg-gray-900/60 text-white"
            />
            <Button
              type="button"
              disabled={!isEmailValid || isSending || isRegistering}
              onClick={handleSendVerification}
              className="h-12 shrink-0 bg-gray-700 px-5 text-white hover:bg-gray-600"
            >
              {isSending
                ? '발송 중...'
                : verificationEmail === normalizedEmail
                  ? '재발송'
                  : '인증 요청'}
            </Button>
          </div>
          {verificationEmail === normalizedEmail && (
            <p className="text-body3-m text-green-400">
              인증 코드가 발송되었습니다.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-credential-code" className="text-gray-400">
            인증 코드
          </Label>
          <Input
            id="local-credential-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verificationCode}
            maxLength={6}
            placeholder="6자리 숫자"
            disabled={verificationEmail !== normalizedEmail || isRegistering}
            onChange={(event) =>
              setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            className="h-12 border-gray-800 bg-gray-900/60 text-white"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="local-credential-password" className="text-gray-400">
              새 비밀번호
            </Label>
            <Input
              id="local-credential-password"
              type="password"
              value={password}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              placeholder="영문·숫자·특수문자 포함"
              disabled={isRegistering}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 border-gray-800 bg-gray-900/60 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="local-credential-password-confirmation"
              className="text-gray-400"
            >
              새 비밀번호 확인
            </Label>
            <Input
              id="local-credential-password-confirmation"
              type="password"
              value={passwordConfirmation}
              maxLength={72}
              autoComplete="new-password"
              placeholder="비밀번호 재입력"
              disabled={isRegistering}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              className="h-12 border-gray-800 bg-gray-900/60 text-white"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={verificationEmail !== normalizedEmail || isRegistering}
          className="h-12 bg-pink-600 px-6 text-white hover:bg-pink-500"
        >
          {isRegistering ? '추가 중...' : '이메일 로그인 추가'}
        </Button>
      </form>
    </section>
  );
}
