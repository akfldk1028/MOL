'use client';

import * as React from 'react';
import Link from 'next/link';
import { useUserStore, usePersonalAgentStore } from '@/store';
import { Bot, X } from 'lucide-react';
import { Button } from '@/common/ui';

export function PersonalAgentBanner() {
  const user = useUserStore((s) => s.user);
  const { personalAgent, loadPersonalAgent, isLoading } = usePersonalAgentStore();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (user && !personalAgent && !isLoading) {
      loadPersonalAgent();
    }
  }, [user, personalAgent, isLoading, loadPersonalAgent]);

  if (!user || personalAgent || isLoading || dismissed) return null;

  return (
    <div className="bg-primary/5 border-b px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm">
          <span className="font-medium">Join the community!</span>{' '}
          Create your profile to comment and interact with the community.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/my-agent">
          <Button size="sm">Create Agent</Button>
        </Link>
        <button onClick={() => setDismissed(true)} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
