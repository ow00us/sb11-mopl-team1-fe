import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { getPlaylistSubscribers } from '@/lib/api/playlists';
import type { SubscriberItemDto } from '@/lib/types';
import defaultProfileImg from '@/assets/ic_profile_default.svg';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
}

export default function SubscriberListDialog({ open, onOpenChange, playlistId }: Props) {
  const [items, setItems] = useState<SubscriberItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [nextIdAfter, setNextIdAfter] = useState<string | undefined>();
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setNextCursor(undefined);
    setNextIdAfter(undefined);
    setLoading(true);
    getPlaylistSubscribers(playlistId, { limit: 20 })
      .then((result) => {
        setItems(result.data);
        setNextCursor(result.nextCursor ?? undefined);
        setNextIdAfter(result.nextIdAfter ?? undefined);
        setHasNext(result.hasNext);
      })
      .finally(() => setLoading(false));
  }, [open, playlistId]);

  const loadMore = async () => {
    if (loading || !hasNext) return;
    setLoading(true);
    try {
      const result = await getPlaylistSubscribers(playlistId, {
        limit: 20,
        cursor: nextCursor,
        idAfter: nextIdAfter,
      });
      setItems((current) => [...current, ...result.data]);
      setNextCursor(result.nextCursor ?? undefined);
      setNextIdAfter(result.nextIdAfter ?? undefined);
      setHasNext(result.hasNext);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] max-h-[min(680px,85vh)] bg-gray-800 border-gray-700">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-title1-sb text-gray-100">구독자</DialogTitle>
          <DialogDescription className="sr-only">플레이리스트 구독자 목록</DialogDescription>
          <DialogClose asChild>
            <button aria-label="닫기" className="text-gray-400 hover:text-white"><X className="size-5" /></button>
          </DialogClose>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {!loading && items.length === 0 ? <p className="py-10 text-center text-gray-400">구독자가 없습니다.</p> : items.map((item) => (
            <div key={item.subscriptionId} className="flex items-center gap-3 border-b border-gray-700 py-3">
              <img src={item.user.profileImageUrl || defaultProfileImg} alt="" className="size-9 rounded-full object-cover" />
              <span className="text-body2-m text-gray-100">{item.user.name || '알 수 없는 사용자'}</span>
            </div>
          ))}
          {hasNext && <button onClick={loadMore} disabled={loading} className="w-full py-3 text-body3-m text-pink-400 disabled:opacity-50">{loading ? '불러오는 중...' : '더 보기'}</button>}
          {loading && items.length === 0 && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
