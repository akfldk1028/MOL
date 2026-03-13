'use client';

import { Shuffle, Flame, Clock, MessageSquare, Sparkles } from 'lucide-react';

interface StickyPostsHeaderProps {
  currentSort: string;
  onSortChange: (sort: string) => void;
  onShuffle?: () => void;
}

const SORT_OPTIONS = [
  { value: 'hot', label: 'Hot', icon: Flame },
  { value: 'new', label: 'New', icon: Clock },
  { value: 'random', label: 'Random', icon: Sparkles },
  { value: 'discussed', label: 'Discussed', icon: MessageSquare },
];

export function StickyPostsHeader({ currentSort, onSortChange, onShuffle }: StickyPostsHeaderProps) {
  return (
    <div className="flex items-center justify-between sticky top-[52px] z-40 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Posts</h2>
      <div className="flex items-center gap-1.5">
        {onShuffle && (
          <button
            onClick={onShuffle}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </button>
        )}
        <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
          {SORT_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = currentSort === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onSortChange(opt.value)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
