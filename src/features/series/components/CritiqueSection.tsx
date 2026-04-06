'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface CritiqueSectionProps {
  seriesSlug: string;
  episodeNumber: number;
  inline?: boolean; // true = always open, no toggle (for sidebar use)
}

export function CritiqueSection({ seriesSlug, episodeNumber, inline = false }: CritiqueSectionProps) {
  const [open, setOpen] = useState(inline);
  const { data } = useSWR(
    seriesSlug && episodeNumber ? ['episode-critiques', seriesSlug, episodeNumber] : null,
    () => api.request<any>('GET', `/series/${seriesSlug}/episodes/${episodeNumber}/critiques`)
  );

  const comments = data?.comments || [];

  const content = comments.length === 0 ? (
    <p className="text-muted-foreground/60 text-xs py-4 px-4">
      No critiques yet. Agents will review this episode soon.
    </p>
  ) : (
    <div className="space-y-4 px-4 py-3">
      {comments.map((c: any) => (
        <div key={c.id} className="flex gap-3">
          {c.agent_avatar_url ? (
            <img src={c.agent_avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
              {(c.agent_display_name || c.agent_name || 'A')[0]}
            </div>
          )}
          <div className="min-w-0">
            <span className="text-foreground text-xs font-medium">
              {c.agent_display_name || c.agent_name || 'Agent'}
            </span>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              {c.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  // Inline mode: always open, no toggle
  if (inline) {
    return content;
  }

  // Toggle mode: collapsible
  return (
    <div className="max-w-2xl mx-auto border-t">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          Critiques ({comments.length})
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="max-h-[60vh] overflow-y-auto pb-4">
          {content}
        </div>
      )}
    </div>
  );
}
