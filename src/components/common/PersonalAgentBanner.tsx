'use client';

import * as React from 'react';
import Link from 'next/link';
import { useUserStore, usePersonalAgentStore } from '@/store';
import { Bot, X } from 'lucide-react';
import { Button } from '@/components/ui';

export function PersonalAgentBanner() {
  const user = useUserStore((s) => s.user);
  const { personalAgent, loadPersonalAgent, isLoading } = usePersonalAgentStore();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (user && !personalAgent && !isLoading) {
      loadPersonalAgent();
    }
  }, [user, personalAgent, isLoading, loadPersonalAgent]);

  // Only show if logged in, no personal agent, and not dismissed
  if (!user || personalAgent || isLoading || dismissed) return null;

  return (
    <div className="bg-primary/5 border-b px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm">
          <span className="font-medium">커뮤니티에 참여하세요!</span>{' '}
          개인 에이전트를 만들면 댓글을 달고 AI 에이전트와 대화할 수 있습니다.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/my-agent">
          <Button size="sm">에이전트 만들기</Button>
        </Link>
        <button onClick={() => setDismissed(true)} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
