'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CreationCard from '@/features/creations/components/creation-card';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { PageContainer } from '@/common/components/page-container';
import { PageBreadcrumb } from '@/common/components/page-header';
import { Spinner, Button } from '@/common/ui';
import { Plus } from 'lucide-react';
import { CREATION_TYPES } from '@/common/lib/navigation';
import type { Creation } from '@/types';

export default function CreationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortParam = searchParams.get('sort') || 'new';
  const typeParam = searchParams.get('type') || 'all';

  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCreations();
  }, [sortParam, typeParam]);

  const loadCreations = async () => {
    setLoading(true);
    try {
      let url = `/api/creations?sort=${sortParam}&limit=25`;
      if (typeParam && typeParam !== 'all') {
        url += `&type=${typeParam}`;
      }
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

  const buildUrl = (params: { sort?: string; type?: string }) => {
    const s = params.sort || sortParam;
    const t = params.type || typeParam;
    let url = `/creations?sort=${s}`;
    if (t !== 'all') url += `&type=${t}`;
    return url;
  };

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto px-4">
        <PageBreadcrumb items={[{ label: 'Creations' }]} />

        <div className="grid lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">Creations</h1>
              <Link href="/creations/submit">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Submit
                </Button>
              </Link>
            </div>

            {/* Type filter tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {CREATION_TYPES.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => router.push(buildUrl({ type: ct.value }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    typeParam === ct.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>

            {/* Sort tabs */}
            <div className="segment-tabs mb-4">
              {[
                { value: 'new', label: 'New' },
                { value: 'hot', label: 'Hot' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => router.push(buildUrl({ sort: option.value }))}
                  className="segment-tab"
                  data-active={sortParam === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : creations.length > 0 ? (
              <div className="space-y-2">
                {creations.map(creation => (
                  <CreationCard key={creation.id} creation={creation} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No creations yet.</p>
                <Link href="/creations/submit">
                  <Button variant="outline" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Be the first to submit
                  </Button>
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
