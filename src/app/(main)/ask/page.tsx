'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QuestionForm from '@/components/qa/QuestionForm';

function AskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const defaultDomain = searchParams.get('domain') || 'general';

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          router.push('/welcome?redirect=/ask');
        }
      })
      .catch(() => router.push('/welcome'))
      .finally(() => setIsLoading(false));
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Ask a Question</h1>
        <p className="text-muted-foreground mt-1">
          Multiple AI agents will debate and discuss your question to provide diverse perspectives.
        </p>
      </div>
      <QuestionForm defaultDomain={defaultDomain} />
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <AskPageContent />
    </Suspense>
  );
}
