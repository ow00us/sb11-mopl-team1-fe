import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import icProfileDefault from '@/assets/ic_profile_default.svg';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { searchUsers } from '@/lib/api/users';
import type { UserSummary } from '@/lib/types';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchCursor {
  nextCursor?: string;
  nextIdAfter?: string;
  hasNext: boolean;
}

const EMPTY_CURSOR: SearchCursor = { hasNext: false };

export default function NewConversationDialog({
  open,
  onOpenChange,
}: NewConversationDialogProps) {
  const navigate = useNavigate();
  const requestSequence = useRef(0);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [cursor, setCursor] = useState<SearchCursor>(EMPTY_CURSOR);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setUsers([]);
      setCursor(EMPTY_CURSOR);
      setError(null);
      return;
    }

    const keyword = query.trim();
    if (!keyword) {
      setUsers([]);
      setCursor(EMPTY_CURSOR);
      setError(null);
      return;
    }

    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchUsers({ keywordLike: keyword, limit: 20 });
        if (sequence !== requestSequence.current) return;
        setUsers(result.data);
        setCursor({
          nextCursor: result.nextCursor ?? undefined,
          nextIdAfter: result.nextIdAfter ?? undefined,
          hasNext: result.hasNext,
        });
      } catch (searchError) {
        if (sequence !== requestSequence.current) return;
        console.error('Failed to search users:', searchError);
        setUsers([]);
        setCursor(EMPTY_CURSOR);
        setError('사용자를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  const handleLoadMore = async () => {
    const keyword = query.trim();
    if (
      !keyword
      || !cursor.hasNext
      || !cursor.nextCursor
      || !cursor.nextIdAfter
      || loadingMore
    ) return;

    setLoadingMore(true);
    try {
      const result = await searchUsers({
        keywordLike: keyword,
        cursor: cursor.nextCursor,
        idAfter: cursor.nextIdAfter,
        limit: 20,
      });
      setUsers((current) => {
        const ids = new Set(current.map((user) => user.userId));
        return [...current, ...result.data.filter((user) => !ids.has(user.userId))];
      });
      setCursor({
        nextCursor: result.nextCursor ?? undefined,
        nextIdAfter: result.nextIdAfter ?? undefined,
        hasNext: result.hasNext,
      });
    } catch (searchError) {
      console.error('Failed to load more users:', searchError);
      setError('사용자를 더 불러오지 못했습니다.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSelectUser = (userId: string) => {
    onOpenChange(false);
    navigate(`/conversations/with?userId=${userId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-3xl border-gray-700 bg-gray-900 p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>새 대화 시작</DialogTitle>
          <DialogDescription>이름으로 사용자를 찾아 대화를 시작할 수 있습니다.</DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <div className="relative">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="사용자 이름 검색"
              className="h-11 w-full rounded-full border border-gray-700 bg-gray-800/70 py-2 pl-11 pr-4 text-body3-m text-white outline-none placeholder:text-gray-500 focus:border-pink-500"
            />
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
          </div>
        </div>

        <div className="max-h-[420px] min-h-[180px] overflow-y-auto px-3 pb-5">
          {loading ? (
            <div className="flex h-[180px] items-center justify-center">
              <div className="size-7 animate-spin rounded-full border-2 border-gray-700 border-t-pink-500" />
            </div>
          ) : error ? (
            <p className="px-3 py-10 text-center text-body3-m text-red-notification">{error}</p>
          ) : !query.trim() ? (
            <p className="px-3 py-10 text-center text-body3-m text-gray-500">검색어를 입력해 주세요.</p>
          ) : users.length === 0 ? (
            <p className="px-3 py-10 text-center text-body3-m text-gray-500">검색 결과가 없습니다.</p>
          ) : (
            <>
              {users.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => handleSelectUser(user.userId)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-gray-800"
                >
                  <div className="size-11 shrink-0 overflow-hidden rounded-full bg-gray-800">
                    <img
                      src={user.profileImageUrl || icProfileDefault}
                      alt=""
                      className="size-full object-cover"
                    />
                  </div>
                  <span className="min-w-0 truncate text-body2-m text-gray-100">
                    {user.name || '알 수 없는 사용자'}
                  </span>
                </button>
              ))}

              {cursor.hasNext && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="mt-2 w-full rounded-xl py-2 text-body3-m text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
                >
                  {loadingMore ? '불러오는 중...' : '더 보기'}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
