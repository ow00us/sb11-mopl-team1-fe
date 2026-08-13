import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getPlaylists, createPlaylist, addContentToPlaylist } from '@/lib/api/playlists';
import usePlaylistStore from '@/lib/stores/usePlaylistStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import type { PlaylistDto, PlaylistCreateRequest } from '@/lib/types';
import icX from '@/assets/ic_X.svg';
import icArrowLeft from '@/assets/ic_arrow_left.svg';

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string;
}

export default function AddToPlaylistDialog({
  open,
  onOpenChange,
  contentId,
}: AddToPlaylistDialogProps) {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [userPlaylists, setUserPlaylists] = useState<PlaylistDto[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  /** 이 콘텐츠를 이미 담고 있는 플레이리스트입니다. */
  const [addedPlaylistIds, setAddedPlaylistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: jwt } = useAuthStore();

  // 모달이 열릴 때 사용자의 플레이리스트 fetch
  useEffect(() => {
    if (open && jwt?.userDto.id) {
      fetchUserPlaylists();
    } else {
      // 모달이 닫힐 때 상태 초기화
      setView('list');
      setUserPlaylists([]);
      setSelectedPlaylistIds(new Set());
      setAddedPlaylistIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jwt?.userDto.id]);

  const fetchUserPlaylists = async () => {
    if (!jwt?.userDto.id) return;

    setLoading(true);
    try {
      const response = await getPlaylists({
        ownerIdEqual: jwt.userDto.id,
        limit: 100,
        sortDirection: 'DESCENDING',
        sortBy: 'updatedAt',
      });

      // 이미 담긴 플레이리스트를 목록에서 빼지 않습니다. 새 플레이리스트를 만들면
      // 그 자리에서 콘텐츠까지 추가되므로, 걸러내면 방금 만든 것이 사라져 생성이
      // 실패한 것처럼 보입니다. 대신 체크된 상태로 구분해 보여줍니다.
      const added = new Set(
        response.data
          .filter((playlist) => playlist.contents.some((content) => content.id === contentId))
          .map((playlist) => playlist.id),
      );

      setUserPlaylists(response.data);
      setAddedPlaylistIds(added);
      setSelectedPlaylistIds(added);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
      toast.error('플레이리스트를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (playlistId: string, isChecked: boolean) => {
    setSelectedPlaylistIds((prev) => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(playlistId);
      } else {
        newSet.delete(playlistId);
      }
      return newSet;
    });
  };

  /** 이번에 새로 체크한 것만 보냅니다. 이미 담긴 것을 다시 보내면 서버가 중복 요청을 받습니다. */
  const playlistIdsToAdd = Array.from(selectedPlaylistIds).filter(
    (playlistId) => !addedPlaylistIds.has(playlistId),
  );

  const handleAddToPlaylists = async () => {
    setAdding(true);
    try {
      await Promise.all(
        playlistIdsToAdd.map((playlistId) => addContentToPlaylist(playlistId, contentId)),
      );

      // 목록 화면이 스토어를 다시 조회하지 않고도 최신 개수를 보이도록 반영합니다.
      syncPlaylistStore(playlistIdsToAdd);

      toast.success('플레이리스트에 추가되었습니다.');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to add content to playlists:', err);
      toast.error('플레이리스트 추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  /** 추가한 플레이리스트의 스토어 사본에도 콘텐츠를 반영합니다. */
  const syncPlaylistStore = (playlistIds: string[]) => {
    const content = userPlaylists
      .flatMap((playlist) => playlist.contents)
      .find((item) => item.id === contentId);
    if (!content) return;

    const store = usePlaylistStore.getState();
    for (const playlistId of playlistIds) {
      const stored = store.data.find((playlist) => playlist.id === playlistId);
      if (stored && !stored.contents.some((item) => item.id === contentId)) {
        store.update(playlistId, { contents: [...stored.contents, content] });
      }
    }
  };

  const handleCreatePlaylist = async (data: PlaylistCreateRequest) => {
    let newPlaylist;
    try {
      newPlaylist = await createPlaylist(data);
    } catch (err) {
      console.error('Failed to create playlist:', err);
      toast.error('플레이리스트 생성에 실패했습니다.');
      return;
    }

    try {
      await addContentToPlaylist(newPlaylist.id, contentId);
    } catch (err) {
      // 생성은 끝난 뒤이므로 생성 실패로 알리면 사실과 다릅니다. 빈 플레이리스트가
      // 남은 상태이니 목록으로 돌려보내 다시 시도할 수 있게 합니다.
      console.error('Failed to add content to new playlist:', err);
      usePlaylistStore.getState().add(newPlaylist);
      toast.error('플레이리스트는 만들었지만 콘텐츠 추가에 실패했습니다.');
      setView('list');
      await fetchUserPlaylists();
      return;
    }

    // 콘텐츠까지 담은 상태로 스토어에 넣습니다. 생성 응답만 넣으면 목록 화면에
    // 콘텐츠 0개로 남습니다.
    const contentInPlaylist = userPlaylists
      .flatMap((playlist) => playlist.contents)
      .find((item) => item.id === contentId);
    usePlaylistStore.getState().add(
      contentInPlaylist
        ? { ...newPlaylist, contents: [...newPlaylist.contents, contentInPlaylist] }
        : newPlaylist,
    );

    toast.success('플레이리스트가 생성되고 콘텐츠가 추가되었습니다.');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-[500px] max-h-[646px] bg-gray-800/50 backdrop-blur-[25px] border border-gray-800 rounded-3xl p-9"
      >
        {view === 'list' ? (
          <PlaylistListView
            userPlaylists={userPlaylists}
            selectedPlaylistIds={selectedPlaylistIds}
            addedPlaylistIds={addedPlaylistIds}
            addableCount={playlistIdsToAdd.length}
            loading={loading}
            adding={adding}
            onCheckboxChange={handleCheckboxChange}
            onAddToPlaylists={handleAddToPlaylists}
            onCreateNew={() => setView('create')}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <CreatePlaylistView
            onBack={() => setView('list')}
            onCreate={handleCreatePlaylist}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PlaylistListViewProps {
  userPlaylists: PlaylistDto[];
  selectedPlaylistIds: Set<string>;
  addedPlaylistIds: Set<string>;
  addableCount: number;
  loading: boolean;
  adding: boolean;
  onCheckboxChange: (playlistId: string, isChecked: boolean) => void;
  onAddToPlaylists: () => void;
  onCreateNew: () => void;
  onClose: () => void;
}

function PlaylistListView({
  userPlaylists,
  selectedPlaylistIds,
  addedPlaylistIds,
  addableCount,
  loading,
  adding,
  onCheckboxChange,
  onAddToPlaylists,
  onCreateNew,
  onClose,
}: PlaylistListViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-6">
        <h2 className="text-title1-sb text-gray-300">플레이리스트 추가</h2>
        <DialogClose asChild>
          <button className="w-6 h-6" onClick={onClose}>
            <img src={icX} alt="닫기" className="w-full h-full" />
          </button>
        </DialogClose>
      </div>

      {/* 플레이리스트 목록 */}
      <div className="flex-1 overflow-y-auto mb-5">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-body2-m text-gray-400">로딩 중...</p>
          </div>
        ) : userPlaylists.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-body2-m text-gray-400">플레이리스트가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {userPlaylists.map((playlist) => (
              <PlaylistCheckboxItem
                key={playlist.id}
                playlist={playlist}
                checked={selectedPlaylistIds.has(playlist.id)}
                alreadyAdded={addedPlaylistIds.has(playlist.id)}
                onChange={(isChecked) => onCheckboxChange(playlist.id, isChecked)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 하단 버튼 - 한 줄 배치 */}
      <div className="flex gap-4">
        {/* 새 플레이리스트 버튼 */}
        <button
          onClick={onCreateNew}
          className="flex-1 h-[54px] bg-gray-700 rounded-xl px-5 py-3 hover:bg-gray-600 transition-colors"
        >
          <span className="text-body2-sb text-gray-50">+ 새 플레이리스트</span>
        </button>

        {/* 추가 버튼 */}
        <button
          onClick={onAddToPlaylists}
          disabled={adding || addableCount === 0}
          className="flex-1 h-[54px] bg-pink-600 rounded-xl px-5 py-3 hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-body1-b text-white">
            {adding ? '추가 중...' : '추가'}
          </span>
        </button>
      </div>
    </div>
  );
}

interface PlaylistCheckboxItemProps {
  playlist: PlaylistDto;
  checked: boolean;
  alreadyAdded: boolean;
  onChange: (checked: boolean) => void;
}

function PlaylistCheckboxItem({
  playlist,
  checked,
  alreadyAdded,
  onChange,
}: PlaylistCheckboxItemProps) {
  return (
    <label
      className={`flex items-center gap-2 py-2.5 px-1 ${alreadyAdded ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        // 이미 담긴 항목은 해제할 수 없습니다. 이 다이얼로그는 추가만 다루고,
        // 제거는 플레이리스트 상세 화면의 역할입니다.
        disabled={alreadyAdded}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 rounded border-2 border-gray-600 bg-transparent checked:bg-pink-600 checked:border-pink-600 cursor-pointer appearance-none flex items-center justify-center after:content-['✓'] after:text-white after:text-sm after:hidden checked:after:block disabled:cursor-default disabled:opacity-60"
      />
      <div className="flex-1">
        <p className={`text-body2-sb ${alreadyAdded ? 'text-gray-400' : 'text-gray-100'}`}>
          {playlist.title}
        </p>
      </div>
      {alreadyAdded && <span className="text-caption1-m text-gray-500">추가됨</span>}
    </label>
  );
}

interface CreatePlaylistViewProps {
  onBack: () => void;
  onCreate: (data: PlaylistCreateRequest) => Promise<void>;
}

function CreatePlaylistView({ onBack, onCreate }: CreatePlaylistViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('제목과 설명을 모두 입력해주세요.');
      return;
    }

    setCreating(true);
    try {
      await onCreate({ title: title.trim(), description: description.trim() });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className="flex items-center gap-2 py-2">
        <button onClick={onBack} className="w-5 h-5">
          <img src={icArrowLeft} alt="뒤로가기" className="w-full h-full" />
        </button>
        <h2 className="text-title1-sb text-gray-300">새 플레이리스트</h2>
      </div>

      {/* 제목 입력 */}
      <div className="flex flex-col gap-2.5">
        <label className="text-body3-sb text-gray-300 px-1">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력해주세요"
          className="h-[54px] w-full bg-gray-800/50 border-[1.5px] border-gray-800 rounded-xl px-5 py-3.5 text-body2-m-140 text-gray-50 placeholder:text-gray-400 focus:outline-none focus:border-pink-600"
        />
      </div>

      {/* 설명 입력 */}
      <div className="flex flex-col gap-2.5">
        <label className="text-body3-sb text-gray-300 px-1">설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명을 입력해주세요"
          className="h-[120px] w-full bg-gray-800/50 border-[1.5px] border-gray-800 rounded-xl px-5 py-4 text-body2-m-140 text-gray-50 placeholder:text-gray-400 focus:outline-none focus:border-pink-600 resize-none"
        />
      </div>

      {/* 버튼 */}
      <div className="flex gap-4 pt-1.5">
        <button
          onClick={onBack}
          disabled={creating}
          className="flex-1 h-[54px] bg-gray-700 rounded-xl text-body1-b text-gray-50 hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={creating || !title.trim() || !description.trim()}
          className="flex-1 h-[54px] bg-pink-600 rounded-xl text-body1-b text-white hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? '생성 중...' : '생성'}
        </button>
      </div>
    </div>
  );
}
