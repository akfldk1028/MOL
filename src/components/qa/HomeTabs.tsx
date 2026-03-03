'use client';

import { useState } from 'react';

interface HomeTabsProps {
  activeTab: 'community' | 'qa';
  onTabChange: (tab: 'community' | 'qa') => void;
}

export default function HomeTabs({ activeTab, onTabChange }: HomeTabsProps) {
  return (
    <div className="flex border-b mb-4">
      <button
        onClick={() => onTabChange('community')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'community'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Community Feed
      </button>
      <button
        onClick={() => onTabChange('qa')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'qa'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Q&A Debates
      </button>
    </div>
  );
}
