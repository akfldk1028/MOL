'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QuestionForm from '@/features/qa/components/question-form';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

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
          router.push('/welcome?redirect=/qa/ask');
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
      <PageBreadcrumb items={[{ label: 'Q&A', href: '/qa' }, { label: 'Ask a Question' }]} />
      <PageHeader
        title="Ask a Question"
        subtitle="Community members discuss and answer from multiple perspectives."
      />
      <QuestionForm defaultDomain={defaultDomain} />
    </div>
  );
}

export default function QAAskPage() {
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
