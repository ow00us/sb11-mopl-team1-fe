import type { DirectMessageDto } from '@/lib/types';
import icProfileDefault from '@/assets/ic_profile_default.svg';
import {useNavigate} from "react-router-dom";

interface MessageBubbleProps {
  message: DirectMessageDto;
  isMine: boolean;
  showProfile?: boolean;
  showReadStatus?: boolean;
}

export default function MessageBubble({
  message,
  isMine,
  showProfile = true,
  showReadStatus = false,
}: MessageBubbleProps) {
  const navigate = useNavigate();
  // 시간 포맷팅 (예: "오전 1:00")
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours < 12 ? '오전' : '오후';
    const displayHours = hours % 12 || 12;
    return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
  };

  if (isMine) {
    // 내가 보낸 메시지 - 오른쪽 정렬, 핑크색
    return (
      <div className="flex min-w-0 items-end justify-end gap-1.5 px-[30px]">
        <div className="flex shrink-0 flex-col items-end gap-0.5 px-0 py-1">
          {showReadStatus && (
            <span className="text-caption1-m text-pink-400">
              {message.readAt ? '읽음' : '미읽음'}
            </span>
          )}
          <span className="text-caption1-m text-gray-600">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div className="min-w-0 bg-pink-700 px-3 py-1.5 rounded-tl-[20px] rounded-tr-[2px] rounded-bl-[20px] rounded-br-[20px] max-w-[min(600px,calc(100%-3rem))]">
          <p className="text-body2-m-160 text-white break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  // 받은 메시지 - 왼쪽 정렬, 회색
  return (
    <div className="flex items-end gap-2.5 px-[30px]">
      {showProfile ? (
        <div className="size-6 rounded-full shrink-0 overflow-hidden cursor-pointer" onClick={() => navigate(`/profiles/${message.sender?.userId}`)}>
          <img
            src={message.sender?.profileImageUrl || icProfileDefault}
            alt={`${message.sender?.name || 'User'} profile`}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        // 프로필을 숨겨도 자리는 남깁니다. 없애면 같은 사람이 연속으로 보낸
        // 메시지가 프로필 너비만큼 왼쪽으로 밀려 첫 메시지와 어긋납니다.
        <div className="size-6 shrink-0" aria-hidden="true" />
      )}
      <div className="flex min-w-0 items-end gap-1.5">
        <div className="min-w-0 bg-gray-800 px-3 py-1.5 rounded-tl-[20px] rounded-tr-[20px] rounded-bl-[2px] rounded-br-[20px] max-w-[min(600px,calc(100%-3rem))]">
          <p className="text-body2-m-160 text-white break-words">{message.content}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-0.5 px-0 py-1">
          {showReadStatus && (
            <span className="text-caption1-m text-pink-400">
              {message.readAt ? '읽음' : '미읽음'}
            </span>
          )}
          <span className="text-caption1-m text-gray-600">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
