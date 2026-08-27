import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withdrawUser } from '@/lib/api/users';
import { clearClientSession } from '@/lib/api/init';
import type { ErrorResponse } from '@/lib/types';

const WITHDRAWAL_CONFIRMATION = '탈퇴합니다';

interface AccountWithdrawalSectionProps {
  userId: string;
}

const errorMessage = (error: unknown): string => {
  if (isAxiosError<ErrorResponse>(error)) {
    return error.response?.data?.message || '회원 탈퇴에 실패했습니다.';
  }

  return '회원 탈퇴에 실패했습니다.';
};

/** 본인 프로필에서 실수 방지 확인을 거쳐 회원 탈퇴를 요청합니다. */
export default function AccountWithdrawalSection({
  userId,
}: AccountWithdrawalSectionProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const canWithdraw = confirmation === WITHDRAWAL_CONFIRMATION;

  const handleOpenChange = (open: boolean) => {
    if (isWithdrawing) return;

    setIsOpen(open);
    if (!open) {
      setConfirmation('');
    }
  };

  const handleWithdraw = async () => {
    if (!canWithdraw || isWithdrawing) return;

    setIsWithdrawing(true);

    try {
      await withdrawUser(userId);
      clearClientSession();
      toast.success('회원 탈퇴가 완료되었습니다.');
      navigate('/sign-in', { replace: true });
    } catch (error) {
      console.error('Failed to withdraw account:', error);
      toast.error(errorMessage(error));
      setIsWithdrawing(false);
    }
  };

  return (
    <section className="mb-[60px] rounded-2xl border border-red-notification/40 bg-red-notification/5 p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-title1-sb text-gray-100">회원 탈퇴</h2>
          <p className="mt-1 text-body3-m text-gray-500">
            탈퇴하면 개인정보와 로그인 수단이 삭제되며 되돌릴 수 없습니다.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setIsOpen(true)}
          className="shrink-0"
        >
          회원 탈퇴
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          hideCloseButton={isWithdrawing}
          className="sm:max-w-[460px]"
          onEscapeKeyDown={(event) => {
            if (isWithdrawing) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isWithdrawing) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-title1-b text-gray-100">
              정말 탈퇴하시겠습니까?
            </DialogTitle>
            <DialogDescription className="text-body2-m leading-6 text-gray-400">
              탈퇴 후에는 기존 계정으로 로그인할 수 없습니다. 계속하려면 아래에
              <strong className="mx-1 text-gray-200">탈퇴합니다</strong>
              를 입력해주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="withdrawal-confirmation" className="text-gray-300">
              확인 문구
            </Label>
            <Input
              id="withdrawal-confirmation"
              value={confirmation}
              autoComplete="off"
              disabled={isWithdrawing}
              placeholder={WITHDRAWAL_CONFIRMATION}
              onChange={(event) => setConfirmation(event.target.value)}
              className="h-12 border-gray-700 bg-gray-900/60 text-white"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isWithdrawing}
              onClick={() => handleOpenChange(false)}
              className="border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canWithdraw || isWithdrawing}
              onClick={handleWithdraw}
            >
              {isWithdrawing ? '탈퇴 처리 중...' : '탈퇴하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
