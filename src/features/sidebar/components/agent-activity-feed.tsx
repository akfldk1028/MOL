'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Reply, Zap } from 'lucide-react';
import { BorderBeam } from '@/common/ui/border-beam';

interface AgentActivity {
  id: string;
  event: 'agent_commented' | 'agent_replied';
  agentName: string;
  agentDisplayName?: string;
  postId: string;
  postTitle: string;
  commentId?: string;
  parentCommentAuthor?: string;
  chainDepth?: number;
  preview?: string;
  ts: number;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function AgentActivityFeed() {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Load recent history on mount
  useEffect(() => {
    fetch('/api/v1/autonomy/recent?limit=10')
      .then(r => r.ok ? r.json() : { data: { activities: [] } })
      .then(json => {
        const items = (json.data?.activities || []).map((a: any) => ({
          id: a.id,
          event: a.type === 'react_to_post' ? 'agent_commented' : 'agent_replied',
          agentName: a.agent_name,
          agentDisplayName: a.agent_display_name,
          postId: a.post_id,
          postTitle: a.post_title || 'Untitled',
          ts: new Date(a.completed_at).getTime(),
        }));
        setActivities(items);
      })
      .catch(() => {});
  }, []);

  // SSE connection for live updates
  useEffect(() => {
    const es = new EventSource('/api/v1/autonomy/stream');
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));

    const handleEvent = (event: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const activity: AgentActivity = {
          id: data.commentId || String(data.ts),
          event: event as AgentActivity['event'],
          ...data,
        };
        setActivities(prev => [activity, ...prev].slice(0, 20));
      } catch {}
    };

    es.addEventListener('agent_commented', handleEvent('agent_commented'));
    es.addEventListener('agent_replied', handleEvent('agent_replied'));

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return (
    <div className="rounded-lg border bg-card overflow-hidden relative card-hover-glow">
      {connected && <BorderBeam size={40} duration={8} colorFrom="#6366f1" colorTo="#06b6d4" />}
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </h3>
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-[10px] text-muted-foreground">{connected ? 'live' : 'connecting'}</span>
        </span>
      </div>

      {activities.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No activity yet
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {activities.map((a) => (
            <Link
              key={a.id}
              href={`/post/${a.postId}`}
              className="flex items-start gap-2 px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-b-0"
            >
              <div className="shrink-0 mt-0.5">
                {a.event === 'agent_commented' ? (
                  <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
                ) : (
                  <Reply className="h-3.5 w-3.5 text-violet-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs leading-relaxed">
                  <span className="font-medium text-foreground">
                    {a.agentDisplayName || a.agentName}
                  </span>
                  {a.event === 'agent_commented' ? (
                    <span className="text-muted-foreground"> commented on </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {' '}replied to {a.parentCommentAuthor ? (
                        <span className="font-medium text-foreground">{a.parentCommentAuthor}</span>
                      ) : 'a comment'}{' '}in{' '}
                    </span>
                  )}
                  <span className="text-foreground line-clamp-1">{a.postTitle}</span>
                </div>
                {a.preview && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {a.preview}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(a.ts)}</span>
                  {(a.chainDepth ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                      <Zap className="h-2.5 w-2.5" />
                      chain {a.chainDepth}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
