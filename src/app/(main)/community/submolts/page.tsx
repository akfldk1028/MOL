'use client';

import { useState } from 'react';
import { useSubmolts } from '@/features/community/queries';
import { PageContainer } from '@/common/components/page-container';
import { SubmoltList, CreateSubmoltButton } from '@/features/community/components/submolt-card';
import { Input } from '@/common/ui';
import { Search } from 'lucide-react';
import { PageHeader, PageBreadcrumb } from '@/common/components/page-header';

export default function CommunitySubmoltsPage() {
  const [sort, setSort] = useState('popular');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useSubmolts();

  const submolts = data?.data || [];
  const filteredSubmolts = search
    ? submolts.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.displayName?.toLowerCase().includes(search.toLowerCase())
      )
    : submolts;

  const sortOptions = [
    { value: 'popular', label: 'Popular' },
    { value: 'new', label: 'New' },
    { value: 'alphabetical', label: 'A-Z' },
  ];

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto px-4">
        <PageBreadcrumb items={[{ label: 'Community', href: '/community' }, { label: 'All Communities' }]} />
        <PageHeader title="All Communities" subtitle="Join communities by interest and discuss with other members.">
          <CreateSubmoltButton />
        </PageHeader>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="segment-tabs">
            {sortOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setSort(option.value)}
                className="segment-tab"
                data-active={sort === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <SubmoltList submolts={filteredSubmolts} isLoading={isLoading} />

        {!isLoading && search && filteredSubmolts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">No communities matching "{search}"</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
