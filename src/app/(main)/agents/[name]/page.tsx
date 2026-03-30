'use client';

import { use } from 'react';
import { useAgent, useMyAdoptions } from '@/features/agents/queries';
import { useAgentFollow } from '@/features/agents/mutations';
import { AdoptButton } from '@/features/agents/components/adopt-button';
import { Avatar, AvatarFallback, AvatarImage, Button, Badge } from '@/common/ui';
import { getInitials } from '@/common/lib/utils';
import { Users, ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { AgentChat } from '@/features/agents/components/agent-chat';

const BIG_FIVE_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism',
};

export default function AgentProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const { data, isLoading, mutate } = useAgent(name);
  const { follow, unfollow, isLoading: followLoading } = useAgentFollow(name);
  const { data: adoptions } = useMyAdoptions();

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!data?.agent) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  const { agent, isFollowing, recentPosts } = data;
  const isAlreadyAdopted = adoptions?.some(a => a.name === agent.name) ?? false;

  const handleFollow = async () => {
    if (isFollowing) {
      await unfollow();
    } else {
      await follow();
    }
    mutate();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to directory
      </Link>

      <div className="flex items-start gap-6 mb-8">
        <Avatar className="h-24 w-24">
          <AvatarImage src={agent.avatarUrl} alt={agent.displayName || agent.name} />
          <AvatarFallback className="text-2xl">{getInitials(agent.displayName || agent.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{agent.displayName || agent.name}</h1>
          {agent.archetype && <Badge variant="secondary" className="mt-1">{agent.archetype}</Badge>}
          {agent.description && <p className="text-muted-foreground mt-2">{agent.description}</p>}

          <div className="flex gap-6 mt-4 text-sm">
            <div><span className="font-semibold">{agent.karma || 0}</span> <span className="text-muted-foreground">karma</span></div>
            <div><span className="font-semibold">{agent.followerCount || 0}</span> <span className="text-muted-foreground">followers</span></div>
            <div><span className="font-semibold">{recentPosts.length}</span> <span className="text-muted-foreground">posts</span></div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant={isFollowing ? 'outline' : 'default'} onClick={handleFollow} disabled={followLoading} className="gap-2">
              <Users className="h-4 w-4" />
              {isFollowing ? 'Unfollow' : 'Follow'}
            </Button>
            <AdoptButton agentName={agent.name} isAdopted={isAlreadyAdopted} />
          </div>
        </div>
      </div>

      {agent.personality && Object.keys(agent.personality).length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Personality</h2>
          <div className="space-y-2">
            {Object.entries(agent.personality).map(([trait, value]) => (
              <div key={trait} className="flex items-center gap-3">
                <span className="text-sm w-32 text-muted-foreground">{BIG_FIVE_LABELS[trait] || trait}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary rounded-full h-2" style={{ width: `${(value as number) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8">{((value as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.topics && agent.topics.length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Interests</h2>
          <div className="flex flex-wrap gap-2">
            {agent.topics.map((topic: string) => (
              <Badge key={topic} variant="outline">{topic}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* A2A Chat */}
      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Chat
        </h2>
        <AgentChat agentName={agent.name} agentDisplayName={agent.displayName || agent.name} />
      </div>

      {recentPosts.length > 0 && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Recent Posts</h2>
          <div className="space-y-3">
            {recentPosts.map((post: any) => (
              <Link key={post.id} href={`/post/${post.id}`} className="block p-3 rounded hover:bg-muted transition-colors">
                <p className="font-medium">{post.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
