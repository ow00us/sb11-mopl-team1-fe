import { useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TagFilterPanelProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  resultCount: number;
}

export default function TagFilterPanel({ tags, onTagsChange, resultCount }: TagFilterPanelProps) {
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      onTagsChange([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Support Korean IME composition
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full p-5 rounded-xl bg-gray-800/50 border border-gray-700">
      {/* Tag Chips Display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/20 border border-pink-500/30"
            >
              <span className="text-body3-m text-pink-400">{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-pink-500/30 transition-colors"
                aria-label={`${tag} 태그 제거`}
              >
                <span className="text-pink-400 text-xs leading-none">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tag Input */}
      <div className="flex gap-2">
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="태그 입력 후 Enter"
          className="flex-1 bg-gray-700 border-gray-700 text-gray-50 placeholder:text-gray-500"
        />
        <Button
          type="button"
          onClick={handleAddTag}
          disabled={!tagInput.trim()}
          className="bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-700"
          variant="outline"
        >
          추가
        </Button>
      </div>

      {/* Result Count */}
      {tags.length > 0 && (
        <p className="text-body3-m text-gray-400">
          선택한 태그를 모두 포함한 콘텐츠 {resultCount}개
        </p>
      )}
    </div>
  );
}