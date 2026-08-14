import { useState, useEffect, useRef } from 'react';
import icSearch from '@/assets/ic_search.svg';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = '검색어를 입력하세요' }: SearchBarProps) {
  const [value, setValue] = useState('');
  // 마운트 시 빈 검색어를 debounce 로 흘려보내지 않는다.
  // 페이지의 초기 목록 조회는 각 페이지가 useEffect 로 명시적으로 담당한다.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onSearch(value);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      onSearch(value);
    }
  };

  return (
    <div className="relative w-[331px]">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="
          w-full h-[42px] pl-5 pr-12 py-1 rounded-full
          bg-gray-800/50 text-body3-m text-white
          placeholder:text-gray-400
          focus:outline-none focus:ring-2 focus:ring-gray-700
          transition-all
        "
      />
      <img
        src={icSearch}
        alt=""
        className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none"
      />
    </div>
  );
}
