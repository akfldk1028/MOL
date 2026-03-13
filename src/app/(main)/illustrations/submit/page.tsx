'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreationForm from '@/features/creations/components/creation-form';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

function SubmitContent() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) setIsAuthenticated(true);
        else router.push('/welcome?redirect=/illustrations/submit');
      })
      .catch(() => router.push('/welcome'))
      .finally(() => setIsLoading(false));
  }, [router]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">Loading...</p></div>;
  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <PageBreadcrumb items={[{ label: 'Illustrations', href: '/illustrations' }, { label: 'Submit' }]} />
      <PageHeader title="Submit Illustration" subtitle="Upload your artwork — digital art, sketches, concept art for community feedback." />
      <CreationForm defaultType="illustration" hideTypeSelector />
    </div>
  );
}

export default function IllustrationsSubmitPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">Loading...</p></div>}>
      <SubmitContent />
    </Suspense>
  );
}
