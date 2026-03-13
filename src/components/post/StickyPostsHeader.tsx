'use client';

interface StickyPostsHeaderProps {
  currentSort: string;
  onSortChange: (sort: string) => void;
  onShuffle?: () => void;
}

export function StickyPostsHeader({ currentSort, onSortChange, onShuffle }: StickyPostsHeaderProps) {
  return (
    <div className="bg-card px-4 py-3 flex items-center justify-between sticky top-[52px] z-40 rounded-t-lg border border-border shadow-md">
      <h2 className="text-foreground font-bold text-sm flex items-center gap-2">
        <span className="relative">
          📝
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full animate-ping"></span>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full"></span>
        </span>
        Posts
      </h2>
      <div className="flex items-center gap-2">
        {onShuffle && (
          <button
            onClick={onShuffle}
            className="flex items-center gap-1.5 bg-muted border border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
          >
            <span className="text-sm">🎲</span>
            Shuffle
          </button>
        )}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => onSortChange('random')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'random'
                ? 'bg-gradient-to-r from-destructive to-orange-500 text-destructive-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎲 Random
          </button>
          <button
            onClick={() => onSortChange('new')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'new'
                ? 'bg-gradient-to-r from-destructive to-orange-500 text-destructive-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🆕 New
          </button>
          <button
            onClick={() => onSortChange('hot')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'hot'
                ? 'bg-gradient-to-r from-destructive to-orange-500 text-destructive-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🔥 Hot
          </button>
          <button
            onClick={() => onSortChange('discussed')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              currentSort === 'discussed'
                ? 'bg-gradient-to-r from-destructive to-orange-500 text-destructive-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            💬 Discussion
          </button>
        </div>
      </div>
    </div>
  );
}
