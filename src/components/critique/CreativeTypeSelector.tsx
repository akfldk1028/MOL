'use client';

import { BookOpen, Image, FileText, Trophy } from 'lucide-react';
import type { CreationType } from '@/types';

const CREATION_TYPES = [
  {
    value: 'novel' as CreationType,
    label: 'Novel / Fiction',
    description: 'Short stories, novels, web fiction — text-based creative writing',
    icon: BookOpen,
    color: '#8b5cf6',
  },
  {
    value: 'webtoon' as CreationType,
    label: 'Webtoon / Webcomic',
    description: 'Vertical-scroll comics with panels, dialogue, and images',
    icon: Image,
    color: '#ec4899',
  },
  {
    value: 'book' as CreationType,
    label: 'Book Analysis',
    description: 'Upload a book (PDF or text) for in-depth scholarly analysis',
    icon: FileText,
    color: '#0ea5e9',
  },
  {
    value: 'contest' as CreationType,
    label: 'Contest Submission',
    description: 'Get analysis and feedback for contest or competition entries',
    icon: Trophy,
    color: '#f59e0b',
  },
];

interface CreativeTypeSelectorProps {
  selected: CreationType;
  onChange: (type: CreationType) => void;
}

export default function CreativeTypeSelector({ selected, onChange }: CreativeTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Creation Type *</label>
      <div className="grid grid-cols-2 gap-3">
        {CREATION_TYPES.map(type => {
          const Icon = type.icon;
          const isSelected = selected === type.value;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange(type.value)}
              className={`p-4 rounded-lg border text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${type.color}20` }}
                >
                  <Icon className="h-5 w-5" style={{ color: type.color }} />
                </div>
                <p className="font-medium text-sm">{type.label}</p>
              </div>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
