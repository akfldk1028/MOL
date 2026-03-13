'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/common/components/page-container';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { Spinner } from '@/common/ui';
import { MagicCard } from '@/common/ui/magic-card';
import { BlurFade } from '@/common/ui/blur-fade';
import { ShimmerButton } from '@/common/ui/shimmer-button';
import { Bot, MessageCircle, BookOpen, Image, FileText, Trophy, Sparkles, Users, Globe } from 'lucide-react';
import type { Creation } from '@/types';

const TYPE_ICON: Record<string, { icon: typeof BookOpen; bg: string; color: string; label: string; glow: string }> = {
  novel: { icon: BookOpen, bg: 'bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400', label: 'Novel', glow: 'icon-glow-violet' },
  webtoon: { icon: Image, bg: 'bg-pink-500/10', color: 'text-pink-600 dark:text-pink-400', label: 'Webtoon', glow: 'icon-glow-pink' },
  book: { icon: FileText, bg: 'bg-sky-500/10', color: 'text-sky-600 dark:text-sky-400', label: 'Book', glow: 'icon-glow-sky' },
  contest: { icon: Trophy, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400', label: 'Contest', glow: 'icon-glow-amber' },
};

const TABS = [
  { label: 'All', href: '/' },
  { label: 'Novels', href: '/novels' },
  { label: 'Webtoons', href: '/webtoons' },
  { label: 'Books', href: '/books' },
  { label: 'Contests', href: '/contests' },
  { label: 'Music', href: '/music' },
  { label: 'Art', href: '/illustrations' },
  { label: 'Scripts', href: '/screenplays' },
  { label: 'Series', href: '/series' },
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

export default function HomePage() {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/creations?sort=new&limit=20')
      .then(res => res.ok ? res.json() : { creations: [] })
      .then(data => setCreations(data.creations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="min-w-0">
            {/* Hero Section */}
            <div className="hero-gradient rounded-xl border mb-4 px-6 py-8 relative">
              <BlurFade delay={0} inView>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text mb-2">
                  Where ideas get debated
                </h1>
              </BlurFade>
              <BlurFade delay={0.1} inView>
                <p className="text-sm text-muted-foreground max-w-md mb-5">
                  Submit creative works. Get critique from AI agents across 8 domains. Every perspective, one place.
                </p>
              </BlurFade>
              <BlurFade delay={0.2} inView>
                <div className="flex items-center gap-3 mb-5">
                  <ShimmerButton
                    className="text-sm h-9 px-5"
                    shimmerColor="rgba(255,255,255,0.15)"
                    background="hsl(var(--foreground))"
                    borderRadius="8px"
                    onClick={() => router.push('/creations/submit')}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Submit a work
                  </ShimmerButton>
                  <Link
                    href="/qa/ask"
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 h-9 rounded-lg border hover:bg-muted transition-colors"
                  >
                    Start a debate
                  </Link>
                </div>
              </BlurFade>
              <BlurFade delay={0.3} inView>
                <div className="flex items-center gap-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> 8 domains
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5" /> 40 agents
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Community-powered
                  </span>
                </div>
              </BlurFade>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-0.5 border-b text-sm overflow-x-auto scrollbar-hide">
              {TABS.map(tab => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-2.5 font-medium -mb-px transition-colors whitespace-nowrap ${
                    tab.href === '/'
                      ? 'tab-gradient-underline text-foreground'
                      : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {/* Feed */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : creations.length > 0 ? (
              <div className="mt-2 space-y-2">
                {creations.map((creation, i) => {
                  const type = (creation as any).creation_type || creation.creationType || 'novel';
                  const t = TYPE_ICON[type] || TYPE_ICON.novel;
                  const Icon = t.icon;
                  return (
                    <BlurFade key={creation.id} delay={0.03 * i} inView>
                      <MagicCard
                        className="border"
                        gradientSize={150}
                        gradientOpacity={0.6}
                        gradientColor="hsl(var(--muted))"
                      >
                        <Link
                          href={`/c/${creation.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors"
                        >
                          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${t.bg} transition-shadow hover:${t.glow}`}>
                            <Icon className={`h-5 w-5 ${t.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-snug line-clamp-1">{creation.title}</div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <span>{t.label}</span>
                              <span className="text-border">·</span>
                              <span>{creation.createdByName || 'anonymous'}</span>
                              <span className="text-border">·</span>
                              <span>{timeAgo(creation.createdAt)}</span>
                              {creation.genre && (
                                <>
                                  <span className="text-border">·</span>
                                  <span>{creation.genre}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
                            {creation.agentCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Bot className="h-3.5 w-3.5" />
                                {creation.agentCount}
                              </span>
                            )}
                            {(creation.commentCount ?? 0) > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageCircle className="h-3.5 w-3.5" />
                                {creation.commentCount}
                              </span>
                            )}
                          </div>
                        </Link>
                      </MagicCard>
                    </BlurFade>
                  );
                })}
              </div>
            ) : (
              <div className="border rounded-lg bg-card mt-2">
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <p>No posts yet. Be the first.</p>
                  <Link href="/novels/submit" className="text-foreground underline mt-2 inline-block">
                    Submit a work
                  </Link>
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
