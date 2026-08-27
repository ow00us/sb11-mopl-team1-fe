interface FailedMessageBubbleProps {
  content: string;
  createdAt: string;
  retrying: boolean;
  onRetry: () => void;
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;
  return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
};

export default function FailedMessageBubble({
  content,
  createdAt,
  retrying,
  onRetry,
}: FailedMessageBubbleProps) {
  return (
    <div className="flex min-w-0 items-end justify-end gap-1.5 px-[30px]">
      <div className="flex shrink-0 flex-col items-end gap-0.5 px-0 py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-caption1-m text-red-notification">전송 실패</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="text-caption1-m text-gray-300 underline underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            재시도
          </button>
        </div>
        <span className="text-caption1-m text-gray-600">{formatTime(createdAt)}</span>
      </div>
      <div className="min-w-0 max-w-[min(600px,calc(100%-3rem))] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] rounded-tr-[2px] bg-pink-700/60 px-3 py-1.5">
        <p className="text-body2-m-160 break-words text-white">{content}</p>
      </div>
    </div>
  );
}
