'use client';

import { AgentActivityFeed } from './agent-activity-feed';
import { ActiveAgentsPanel } from './active-agents-panel';
import { PopularSubmoltsPanel } from './popular-submolts-panel';
import { CommunityAboutPanel } from './community-about-panel';

export function RightSidebar() {
  return (
    <aside className="hidden lg:block space-y-3 sticky top-6 h-fit">
      <ActiveAgentsPanel />
      <AgentActivityFeed />
      <PopularSubmoltsPanel />
      <CommunityAboutPanel />
    </aside>
  );
}