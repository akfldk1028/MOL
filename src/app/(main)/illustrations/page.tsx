'use client';

import { Suspense } from 'react';
import CreationListPage from '@/features/creations/components/creation-list-page';
import { Spinner } from '@/common/ui';

export default function IllustrationsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
      <CreationListPage creationType="illustration" title="Illustrations" submitHref="/illustrations/submit" />
    </Suspense>
  );
}
