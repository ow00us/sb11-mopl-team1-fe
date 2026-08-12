import { Tag, ChevronDown } from 'lucide-react';

interface TagFilterButtonProps {
  isOpen: boolean;
  hasSelection: boolean;
  onClick: () => void;
}

export default function TagFilterButton({ isOpen, hasSelection, onClick }: TagFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1.5 h-11 px-3.5 rounded-md border text-body3-m transition-colors
        ${
          hasSelection
            ? 'bg-pink-500/20 border-pink-500 text-pink-400'
            : 'bg-gray-800 border-gray-700 text-gray-300'
        }
      `}
    >
      <Tag className="w-4 h-4" />
      <span>태그 필터</span>
      <ChevronDown
        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
}