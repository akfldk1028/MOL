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

function SajuProfileCard({ persona }: { persona: string }) {
  // Parse key sections from persona text
  const dayMasterMatch = persona.match(/Day Master:\s*(.+?)(?:\n|$)/);
  const patternMatch = persona.match(/Pattern:\s*(.+?)(?:\n|$)/);
  const strengthMatch = persona.match(/Day Strength:\s*(.+?)(?:\n|$)/);
  const specialMatch = persona.match(/SPECIAL TRAITS[^]*?(?:\n- (.+?)(?:\n|$))/g);
  const pillarSection = persona.match(/YEAR pillar.*?HOUR pillar.*?\n.*?\n/s);

  // Extract pillars
  const pillars: { label: string; stem: string; branch: string }[] = [];
  const pillarRegex = /(YEAR|MONTH|DAY|HOUR) pillar \[.*?\]:\s*\n\s+(\S+\([^)]+\)).*?\n\s+(\S+\([^)]+\))/g;
  let m;
  while ((m = pillarRegex.exec(persona)) !== null) {
    const labelMap: Record<string, string> = { YEAR: '년주', MONTH: '월주', DAY: '일주', HOUR: '시주' };
    pillars.push({ label: labelMap[m[1]] || m[1], stem: m[2], branch: m[3] });
  }

  const specialTraits: string[] = [];
  const traitRegex = /- (.+?)(?:\n|$)/g;
  const traitSection = persona.match(/SPECIAL TRAITS[^]*?(?:===|$)/);
  if (traitSection) {
    let t;
    while ((t = traitRegex.exec(traitSection[0])) !== null) {
      if (!t[1].startsWith('===')) specialTraits.push(t[1]);
    }
  }

  if (!dayMasterMatch && pillars.length === 0) return null;

  return (
    <div className="border rounded-lg p-4 mb-6">
      <h2 className="font-semibold mb-3">사주 프로필 (四柱)</h2>

      {pillars.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {pillars.map((p) => (
            <div key={p.label} className="text-center p-2 bg-muted rounded">
              <div className="text-xs text-muted-foreground">{p.label}</div>
              <div className="text-sm font-semibold">{p.stem.split('(')[0]}</div>
              <div className="text-xs">{p.branch.split('(')[0]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1 text-sm">
        {dayMasterMatch && (
          <p><span className="font-medium">일주:</span> {dayMasterMatch[1]}</p>
        )}
        {patternMatch && (
          <p><span className="font-medium">격국:</span> {patternMatch[1]}</p>
        )}
        {strengthMatch && (
          <p><span className="font-medium">신강/신약:</span> {strengthMatch[1]}</p>
        )}
      </div>

      {specialTraits.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium mb-1">특수 성향</p>
          <div className="flex flex-wrap gap-1">
            {specialTraits.map((trait) => (
              <span key={trait} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                {trait.split(' — ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
          {/* HR Badge */}
          {agent.level && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded ${
                agent.level === 1 ? 'bg-purple-600 text-white' :
                agent.level === 2 ? 'bg-blue-600 text-white' :
                agent.level === 3 ? 'bg-green-600 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {agent.title || (['', 'VP', 'Lead', 'Senior', 'Junior'][agent.level])}
              </span>
              {agent.department && (
                <span className="text-xs text-muted-foreground">
                  {agent.department.replace(/_/g, ' ')} · {agent.team?.replace(/_/g, ' ')}
                </span>
              )}
              {(agent.evaluationGrade || agent.evaluation_grade) && (
                <span className={`text-xs font-semibold ${
                  (agent.evaluationGrade || agent.evaluation_grade) === 'S' ? 'text-yellow-500' :
                  (agent.evaluationGrade || agent.evaluation_grade) === 'A' ? 'text-green-500' :
                  (agent.evaluationGrade || agent.evaluation_grade) === 'B' ? 'text-blue-500' :
                  (agent.evaluationGrade || agent.evaluation_grade) === 'C' ? 'text-orange-500' :
                  'text-red-500'
                }`}>
                  Grade {agent.evaluationGrade || agent.evaluation_grade}
                </span>
              )}
            </div>
          )}
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

      {/* Saju Profile — parsed from persona */}
      {agent.persona && (
        <SajuProfileCard persona={agent.persona} />
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
