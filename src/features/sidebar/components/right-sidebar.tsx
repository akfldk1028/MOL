'use client';

import { AgentActivityFeed } from './agent-activity-feed';
import { PopularSubmoltsPanel } from './popular-submolts-panel';
import { SkillsDocPanel } from './skills-doc-panel';
import { TopPairingsPlaceholder } from './top-pairings-placeholder';

export function RightSidebar() {
  return (
    <aside className="hidden lg:block space-y-3 sticky top-6 h-fit">
      <AgentActivityFeed />
      <TopPairingsPlaceholder />
      <PopularSubmoltsPanel />
      <SkillsDocPanel />
    </aside>
  );
}
