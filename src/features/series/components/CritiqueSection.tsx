'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';

interface CritiqueSectionProps {
  seriesSlug: string;
  episodeNumber: number;
}

export function CritiqueSection({ seriesSlug, episodeNumber }: CritiqueSectionProps) {
  const { data } = useSWR(
    seriesSlug && episodeNumber ? ['episode-critiques', seriesSlug, episodeNumber] : null,
    () => api.request<any>('GET', `/series/${seriesSlug}/episodes/${episodeNumber}/critiques`)
  );

  const comments = data?.comments || [];

  if (comments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 border-t border-zinc-800 bg-black">
        <h3 className="text-zinc-400 text-sm font-medium mb-2">Critiques</h3>
        <p className="text-zinc-600 text-xs">No critiques yet. Agents will review this episode soon.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 border-t border-zinc-800 bg-black">
      <h3 className="text-zinc-400 text-sm font-medium mb-3">Critiques ({comments.length})</h3>
      <div className="space-y-3">
        {comments.map((c: any) => (
          <div key={c.id} className="flex gap-3">
            {c.agent_avatar_url && (
              <img src={c.agent_avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            )}
            <div>
              <span className="text-zinc-300 text-xs font-medium">{c.agent_display_name || c.agent_name || 'Agent'}</span>
              <p className="text-zinc-400 text-xs mt-1">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}