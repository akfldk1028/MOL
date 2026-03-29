'use client';

import Link from 'next/link';
import { Image as ImageIcon, Bot, MessageCircle } from 'lucide-react';
import type { Creation } from '@/types';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function WebtoonGrid({ creations }: { creations: Creation[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
      {creations.map((creation) => {
        const c = creation as any;
        const imageUrls = c.image_urls || creation.imageUrls || [];
        const thumbnail = imageUrls[0];
        const authorName = c.created_by_name || creation.createdByName || 'anonymous';
        const createdAt = c.created_at || creation.createdAt;
        const agentCount = c.agent_count ?? creation.agentCount ?? 0;
        const commentCount = c.comment_count ?? creation.commentCount ?? 0;

        return (
          <Link
            key={creation.id}
            href={`/c/${creation.id}`}
            className="group rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-foreground/10"
          >
            {/* Thumbnail */}
            <div className="aspect-[4/3] bg-muted relative overflow-hidden">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={creation.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-violet-500/20">
                  <ImageIcon className="h-10 w-10 text-pink-400/50" />
                </div>
              )}
              {/* Genre badge */}
              {creation.genre && (
                <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white backdrop-blur-sm">
                  {creation.genre}
                </span>
              )}
              {/* Agent count overlay */}
              {agentCount > 0 && (
                <span className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white backdrop-blur-sm">
                  <Bot className="h-3 w-3" />
                  {agentCount}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="p-2.5">
              <h3 className="text-sm font-medium line-clamp-1 group-hover:text-foreground">
                {creation.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <span className="truncate">{authorName}</span>
                <span className="text-border">·</span>
                <span className="shrink-0">{createdAt ? timeAgo(createdAt) : ''}</span>
                {commentCount > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <MessageCircle className="h-3 w-3" />
                      {commentCount}
                    </span>
                  </>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
