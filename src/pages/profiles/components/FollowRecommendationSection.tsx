import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFollow, getFollowRecommendations } from '@/lib/api/follows';
import type { FollowRecommendationItemDto } from '@/lib/types';
import icProfileDefault from '@/assets/ic_profile_default.svg';
import { Button } from '@/components/ui/button';

export default function FollowRecommendationSection() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FollowRecommendationItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingId, setFollowingId] = useState<string | null>(null);

  useEffect(() => {
    getFollowRecommendations({ limit: 5 })
      .then((result) => setItems(result.data))
      .catch((error) => console.error('Failed to fetch follow recommendations:', error))
      .finally(() => setLoading(false));
  }, []);

  const handleFollow = async (userId: string) => {
    if (followingId) return;
    setFollowingId(userId);
    try {
      await createFollow({ followeeId: userId });
      setItems((current) => current.filter((item) => item.user.userId !== userId));
    } catch (error) {
      console.error('Failed to follow recommendation:', error);
    } finally {
      setFollowingId(null);
    }
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="mt-10 max-w-[620px]">
      <h2 className="mb-4 text-title1-sb text-gray-100">추천 팔로워</h2>
      <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/40 px-4">
        {loading ? <p className="py-5 text-body2-m text-gray-400">불러오는 중...</p> : items.map((item) => (
          <div key={item.user.userId} className="flex items-center gap-3 py-3">
            <button type="button" onClick={() => navigate(`/profiles/${item.user.userId}`)}>
              <img src={item.user.profileImageUrl || icProfileDefault} alt="" className="size-10 rounded-full object-cover" />
            </button>
            <button type="button" onClick={() => navigate(`/profiles/${item.user.userId}`)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-body2-sb text-gray-100">{item.user.name || '알 수 없는 사용자'}</span>
              <span className="text-body3-m text-gray-400">공통 팔로잉 {item.commonFollowingCount}명</span>
            </button>
            <Button onClick={() => handleFollow(item.user.userId)} disabled={followingId !== null} className="h-8 shrink-0 bg-pink-500 px-3 text-body3-sb hover:bg-pink-600">
              팔로우
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
