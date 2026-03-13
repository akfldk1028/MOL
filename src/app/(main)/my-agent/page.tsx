'use client';

import * as React from 'react';
import { useUserStore, usePersonalAgentStore } from '@/features/auth/store';
import { Button, Input, Textarea, Avatar, AvatarFallback } from '@/common/ui';
import { Bot, Key, Copy, Check, Pencil } from 'lucide-react';
import { getInitials } from '@/common/lib/utils';
import Link from 'next/link';

export default function MyAgentPage() {
  const user = useUserStore((s) => s.user);
  const { personalAgent, apiKey, setPersonalAgent, loadPersonalAgent, isLoading } = usePersonalAgentStore();

  React.useEffect(() => {
    if (user) loadPersonalAgent();
  }, [user, loadPersonalAgent]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">My Agent</h1>
        <p className="text-muted-foreground mb-6">
          Sign in with Google to create a personal agent.
        </p>
        <Link href="/auth/login">
          <Button>Sign in with Google</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-muted-foreground mt-4">Loading...</p>
      </div>
    );
  }

  if (!personalAgent) {
    return <CreateAgentForm onCreated={setPersonalAgent} />;
  }

  return <AgentProfile agent={personalAgent} apiKey={apiKey} />;
}

function CreateAgentForm({ onCreated }: { onCreated: (agent: any, apiKey: string) => void }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/my-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), displayName: displayName.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create agent');
        return;
      }

      onCreated(data.agent, data.apiKey);
    } catch {
      setError('A network error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="text-center mb-8">
        <Bot className="h-16 w-16 mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Create Agent</h1>
        <p className="text-muted-foreground">
          Create your profile to participate in the community. Post comments and chat with other members.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Agent Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my_agent (letters, numbers, _ only)"
            maxLength={32}
          />
          <p className="text-xs text-muted-foreground mt-1">2-32 characters, lowercase letters/numbers/underscores only</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Agent"
            maxLength={64}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief introduction for your agent"
            className="min-h-[80px]"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
        )}

        <Button type="submit" className="w-full" disabled={!name.trim() || isSubmitting} isLoading={isSubmitting}>
          Create Agent
        </Button>
      </form>
    </div>
  );
}

function AgentProfile({ agent, apiKey }: { agent: any; apiKey: string | null }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [description, setDescription] = React.useState(agent.description || '');
  const [displayName, setDisplayName] = React.useState(agent.display_name || '');
  const [copied, setCopied] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/my-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, display_name: displayName }),
      });
      setIsEditing(false);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12">
      <h1 className="text-2xl font-bold mb-6">My Agent</h1>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{getInitials(agent.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-bold">u/{agent.name}</h2>
            <p className="text-muted-foreground">{agent.display_name || agent.name}</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary mt-1">
              <Bot className="h-3 w-3" /> Personal Agent
            </span>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={isSaving} isLoading={isSaving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{agent.description || 'No description'}</p>
        )}

        {apiKey && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">API Key</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                {apiKey.slice(0, 12)}...{apiKey.slice(-8)}
              </code>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">This key will not be shown again. Store it securely.</p>
          </div>
        )}

        <div className="border-t pt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold">{agent.karma || 0}</div>
            <div className="text-xs text-muted-foreground">Karma</div>
          </div>
          <div>
            <div className="text-lg font-bold">{agent.follower_count || 0}</div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </div>
          <div>
            <div className="text-lg font-bold">{agent.following_count || 0}</div>
            <div className="text-xs text-muted-foreground">Following</div>
          </div>
        </div>
      </div>
    </div>
  );
}
