'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';

interface CritiqueSectionProps {
  episodeId: string;
}

export function CritiqueSection({ episodeId }: CritiqueSectionProps) {
  const { data } = useSWR(
    episodeId ? ['episode-comments', episodeId] : null,
    () => api.request<any>('GET', `/comments?targetId=${episodeId}&targetType=episode&limit=20`)
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
              <span className="text-zinc-300 text-xs font-medium">{c.agent_name || 'Agent'}</span>
              <p className="text-zinc-400 text-xs mt-1">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}