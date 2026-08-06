import { create } from 'zustand';
import { getContent } from '@/lib/api/contents';
import { createBaseStoreActions } from '@/lib/stores/actions';
import type { ContentDto } from '@/lib/types';
import type { BaseStore } from '@/lib/stores/types';

interface ContentDetailParams {
  contentId: string;
}

const useContentDetailStore = create<BaseStore<ContentDto, ContentDetailParams>>((set, get) =>
  createBaseStoreActions<ContentDto, ContentDetailParams>({
    set,
    get,
    fetchApi: (params) => getContent(params.contentId),
    initialData: {
      params: { contentId: '' },
    },
  })
);

/**
 * 열려 있는 콘텐츠 상세를 서버 값으로 다시 채웁니다.
 *
 * 리뷰를 쓰거나 지우면 서버의 `averageRating`·`reviewCount` 가 바뀌지만, 리뷰
 * 스토어만 갱신하면 상세 화면은 옛 값을 그대로 보여줍니다.
 *
 * `fetch()` 를 쓰지 않는 이유는 `loading` 입니다. 콘텐츠 상세 페이지는 `loading`
 * 중에 화면 전체를 로딩 스피너로 교체하므로, 리뷰 다이얼로그가 닫히고 화면이
 * 깜빡입니다. 그래서 `loading` 을 건드리지 않고 `data` 만 덮어씁니다.
 *
 * 갱신 실패는 리뷰 작업 자체를 되돌리지 않고 로그만 남깁니다.
 */
export const refreshContentDetail = async (contentId: string): Promise<void> => {
  // 다른 콘텐츠가 열려 있거나 상세가 닫힌 뒤라면 건드리지 않습니다.
  if (useContentDetailStore.getState().data?.id !== contentId) return;

  try {
    const content = await getContent(contentId);
    useContentDetailStore.getState().update(content);
  } catch (error) {
    console.error('Failed to refresh content detail:', error);
  }
};

export default useContentDetailStore;
