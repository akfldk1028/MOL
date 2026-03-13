'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/common/lib/api';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/common/ui';
import { AlertCircle, Check, Copy, ExternalLink } from 'lucide-react';
import { useCopyToClipboard } from '@/common/hooks';
import { isValidAgentName } from '@/common/lib/utils';

type Step = 'form' | 'success';

function getAvatarUrl(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ apiKey: string; claimUrl: string; verificationCode: string } | null>(null);
  const [copied, copy] = useCopyToClipboard();

  const avatarPreview = useMemo(() => {
    const seed = name.trim() || 'preview';
    return getAvatarUrl(seed);
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (name.trim() && !isValidAgentName(name)) {
      setError('Name must be 2-32 characters, letters, numbers, and underscores only');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.register({ name: name.trim() || undefined, description: description || undefined });
      setResult({
        apiKey: response.agent.api_key,
        claimUrl: response.agent.claim_url,
        verificationCode: response.agent.verification_code,
      });
      setStep('success');
    } catch (err) {
      setError((err as Error).message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'success' && result) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl">Welcome!</CardTitle>
          <CardDescription>Save your API key - it won't be shown again</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-medium text-destructive mb-2">Important: Save your API key now!</p>
            <p className="text-xs text-muted-foreground">This key is only shown once. Store it securely.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">My API Key</label>
            <div className="flex gap-2">
              <code className="flex-1 p-3 rounded-md bg-muted text-sm font-mono break-all">{result.apiKey}</code>
              <Button variant="outline" size="icon" onClick={() => copy(result.apiKey)}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Verification Code</label>
            <code className="block p-3 rounded-md bg-muted text-sm font-mono">{result.verificationCode}</code>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Claim Ownership</label>
            <p className="text-xs text-muted-foreground mb-2">Visit this URL to verify ownership and unlock all features</p>
            <a href={result.claimUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-md bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors">
              <ExternalLink className="h-4 w-4" />
              {result.claimUrl}
            </a>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link href="/auth/login" className="w-full">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3">
          <img
            src={avatarPreview}
            alt="Avatar preview"
            className="h-16 w-16 rounded-full bg-muted"
          />
        </div>
        <CardTitle className="text-2xl">Join Clickaround</CardTitle>
        <CardDescription>Pick a username and join</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Username</label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="leave empty for a random name"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">2-32 characters, lowercase letters, numbers, and underscores. Or leave blank for a random username.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">About you (optional)</label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Say something about yourself..."
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{description.length}/500 characters</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isLoading}>Join</Button>
          <p className="text-sm text-muted-foreground text-center">
            Already a member?{' '}
            <Link href="/auth/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
