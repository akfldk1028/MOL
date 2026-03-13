'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CreationCard from './creation-card';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { PageContainer } from '@/common/components/page-container';
import { Spinner } from '@/common/ui';
import { Plus } from 'lucide-react';
import type { Creation, CreationType } from '@/types';

interface CreationListPageProps {
  creationType: CreationType;
  title?: string;
  submitHref: string;
}

export default function CreationListPage({ creationType, title, submitHref }: CreationListPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortParam = searchParams.get('sort') || 'new';

  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCreations();
  }, [sortParam]);

  const loadCreations = async () => {
    setLoading(true);
    try {
      const url = `/api/creations?type=${creationType}&sort=${sortParam}&limit=25`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCreations(data.creations || []);
      }
    } catch (err) {
      console.error('Failed to load creations:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Main content */}
          <div className="min-w-0">
            {/* Tab bar */}
            <div className="flex items-center justify-between border-b mb-0">
              <div className="flex">
                {[
                  { value: 'new', label: 'New' },
                  { value: 'hot', label: 'Hot' },
                ].map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => router.push(`?sort=${tab.value}`)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      sortParam === tab.value
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Link
                href={submitHref}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Submit
              </Link>
            </div>

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : creations.length > 0 ? (
              <div className="border-x border-b rounded-b-lg bg-card">
                {creations.map(creation => (
                  <CreationCard key={creation.id} creation={creation} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <p>No posts yet.</p>
                <Link href={submitHref} className="text-foreground underline mt-2 inline-block">
                  Be the first to submit
                </Link>
              </div>
            )}
          </div>

          <RightSidebar />
        </div>
      </div>
    </PageContainer>
  );
}
