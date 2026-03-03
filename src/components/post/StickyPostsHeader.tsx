'use client';

interface StickyPostsHeaderProps {
  currentSort: string;
  onSortChange: (sort: string) => void;
  onShuffle?: () => void;
}

export function StickyPostsHeader({ currentSort, onSortChange, onShuffle }: StickyPostsHeaderProps) {
  return (
    <div className="bg-[#1a1a1b] px-4 py-3 flex items-center justify-between sticky top-[52px] z-40 rounded-t-lg border border-[#333] shadow-md">
      <h2 className="text-white font-bold text-sm flex items-center gap-2">
        <span className="relative">
          📝
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#e01b24] rounded-full animate-ping"></span>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#e01b24] rounded-full"></span>
        </span>
        게시글
      </h2>
      <div className="flex items-center gap-2">
        {onShuffle && (
          <button
            onClick={onShuffle}
            className="flex items-center gap-1.5 bg-[#2d2d2e] border border-[#00d4aa] text-[#00d4aa] hover:bg-[#00d4aa] hover:text-[#1a1a1b] text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-[#00d4aa]/20 active:scale-95"
          >
            <span className="text-sm">🎲</span>
            셔플
          </button>
        )}
        <div className="flex items-center gap-1 bg-[#2d2d2e] rounded-lg p-0.5">
          <button
            onClick={() => onSortChange('random')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'random'
                ? 'bg-gradient-to-r from-[#e01b24] to-[#ff6b35] text-white'
                : 'text-[#888] hover:text-white'
            }`}
          >
            🎲 랜덤
          </button>
          <button
            onClick={() => onSortChange('new')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'new'
                ? 'bg-gradient-to-r from-[#e01b24] to-[#ff6b35] text-white'
                : 'text-[#888] hover:text-white'
            }`}
          >
            🆕 최신
          </button>
          <button
            onClick={() => onSortChange('hot')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'hot'
                ? 'bg-gradient-to-r from-[#e01b24] to-[#ff6b35] text-white'
                : 'text-[#888] hover:text-white'
            }`}
          >
            🔥 인기
          </button>
          <button
            onClick={() => onSortChange('discussed')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'discussed'
                ? 'bg-gradient-to-r from-[#e01b24] to-[#ff6b35] text-white'
                : 'text-[#888] hover:text-white'
            }`}
          >
            💬 토론
          </button>
        </div>
      </div>
    </div>
  );
}
