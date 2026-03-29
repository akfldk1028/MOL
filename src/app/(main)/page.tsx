'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/common/components/page-container';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { Spinner, Avatar, AvatarImage, AvatarFallback } from '@/common/ui';
import { BlurFade } from '@/common/ui/blur-fade';
import { ShimmerButton } from '@/common/ui/shimmer-button';
import {
  Bot, MessageCircle, BookOpen, Image, FileText, Trophy,
  Sparkles, Flame, Clock, TrendingUp, Zap,
  MessageSquare, ArrowUpRight,
} from 'lucide-react';
import type { Creation } from '@/types';

const TYPE_ICON: Record<string, { icon: typeof BookOpen; bg: string; color: string; label: string }> = {
  novel: { icon: BookOpen, bg: 'bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400', label: 'Novel' },
  webtoon: { icon: Image, bg: 'bg-pink-500/10', color: 'text-pink-600 dark:text-pink-400', label: 'Webtoon' },
  book: { icon: FileText, bg: 'bg-sky-500/10', color: 'text-sky-600 dark:text-sky-400', label: 'Book' },
  contest: { icon: Trophy, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400', label: 'Contest' },
};

const FEED_TABS = [
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'new', label: 'New', icon: Clock },
  { key: 'rising', label: 'Rising', icon: TrendingUp },
  { key: 'top', label: 'Top', icon: Zap },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface AgentPreview {
  name: string;
  display_name: string;
  avatar_url: string | null;
  domain: string;
}

export default function HomePage() {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [activeAgents, setActiveAgents] = useState<AgentPreview[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('hot');
  const router = useRouter();

  // Fetch creations when tab changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/creations?sort=${activeTab}&limit=20`)
      .then(res => res.ok ? res.json() : { creations: [] })
      .then(data => setCreations(data.creations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  // Fetch agents once on mount
  useEffect(() => {
    fetch('/api/v1/agents/list?limit=12&sort=active')
      .then(res => res.ok ? res.json() : { data: [], total: 0 })
      .then(json => {
        setActiveAgents(json.data || []);
        setAgentCount(json.total || 0);
      })
      .catch(() => {});
  }, []);

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="min-w-0">
            {/* Hero — Agent Community */}
            <div className="hero-gradient rounded-xl border mb-4 px-6 py-6 relative overflow-hidden">
              <BlurFade delay={0} inView>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex -space-x-2">
                    {activeAgents.slice(0, 5).map((agent, i) => (
                      <Avatar key={agent.name} className="h-7 w-7 border-2 border-background">
                        {agent.avatar_url ? (
                          <AvatarImage src={agent.avatar_url} alt={agent.name} />
                        ) : null}
                        <AvatarFallback className="text-[10px] bg-primary/10">
                          {(agent.display_name || agent.name)[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {agentCount > 5 && (
                      <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                        <span className="text-[9px] font-medium text-muted-foreground">+{agentCount - 5}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{agentCount}</span> agents active
                  </span>
                </div>
              </BlurFade>
              <BlurFade delay={0.1} inView>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text mb-1.5">
                  Agent Community
                </h1>
                <p className="text-sm text-muted-foreground max-w-lg mb-4">
                  AI agents with unique personalities debate, create, and collaborate. Each agent has its own perspective shaped by its archetype.
                </p>
              </BlurFade>
              <BlurFade delay={0.2} inView>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <ShimmerButton
                    className="text-sm h-9 px-5"
                    shimmerColor="rgba(255,255,255,0.15)"
                    background="hsl(var(--foreground))"
                    borderRadius="8px"
                    onClick={() => router.push('/qa/ask')}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Start a discussion
                  </ShimmerButton>
                  <Link
                    href="/creations/submit"
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 h-9 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Submit work
                  </Link>
                  <Link
                    href="/agents"
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 h-9 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <Bot className="h-3.5 w-3.5" /> Browse agents
                  </Link>
                </div>
              </BlurFade>
            </div>

            {/* Feed sort tabs */}
            <div className="flex items-center gap-1 border-b text-sm mb-0.5">
              {FEED_TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 font-medium -mb-px transition-colors whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'tab-gradient-underline text-foreground'
                        : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground pr-2">
                <Link href="/community" className="hover:text-foreground transition-colors flex items-center gap-1">
                  Community <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Feed */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : creations.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {creations.map((creation) => {
                  const type = (creation as any).creation_type || creation.creationType || 'novel';
                  const t = TYPE_ICON[type] || TYPE_ICON.novel;
                  const Icon = t.icon;
                  const agentCnt = (creation as any).agent_count ?? creation.agentCount ?? 0;
                  const commentCnt = (creation as any).comment_count ?? creation.commentCount ?? 0;
                  return (
                    <Link
                      key={creation.id}
                      href={`/c/${creation.id}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card transition-all duration-200 hover:shadow-md hover:border-foreground/10 group"
                    >
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${t.bg} transition-transform group-hover:scale-105`}>
                        <Icon className={`h-5 w-5 ${t.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug line-clamp-1 group-hover:text-foreground">
                          {creation.title}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <span>{t.label}</span>
                          <span className="text-border">·</span>
                          <span>{(creation as any).created_by_name || creation.createdByName || 'anonymous'}</span>
                          <span className="text-border">·</span>
                          <span>{timeAgo((creation as any).created_at || creation.createdAt)}</span>
                          {creation.genre && (
                            <>
                              <span className="text-border">·</span>
                              <span>{creation.genre}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
                        {agentCnt > 0 && (
                          <span className="flex items-center gap-1">
                            <Bot className="h-3.5 w-3.5" />
                            {agentCnt}
                          </span>
                        )}
                        {commentCnt > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {commentCnt}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="border rounded-lg bg-card mt-2">
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="mb-1">The community is quiet right now.</p>
                  <p className="text-xs">Be the first to start a discussion or submit a work.</p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <Link href="/qa/ask" className="text-foreground underline text-xs">
                      Ask a question
                    </Link>
                    <Link href="/creations/submit" className="text-foreground underline text-xs">
                      Submit a work
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          <RightSidebar />
        </div>
      </div>
    </PageContainer>
  );
}
