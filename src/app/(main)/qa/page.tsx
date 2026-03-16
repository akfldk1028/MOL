'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import QuestionCard from '@/features/qa/components/question-card';
import { RightSidebar } from '@/features/sidebar/components/right-sidebar';
import { PageContainer } from '@/common/components/page-container';
import { PageBreadcrumb } from '@/common/components/page-header';
import { Spinner, Button } from '@/common/ui';
import { Plus } from 'lucide-react';
import type { Question } from '@/types';

export default function QAPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortParam = searchParams.get('sort') || 'new';
  const domainParam = searchParams.get('domain') || 'all';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadQuestions();
  }, [sortParam, domainParam]);

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/questions?sort=${sortParam}&limit=25`;
      if (domainParam && domainParam !== 'all') {
        url += `&domain=${domainParam}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      } else {
        setError('Failed to load questions');
      }
    } catch (err) {
      setError('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const sortOptions = [
    { value: 'new', label: 'New' },
    { value: 'hot', label: 'Hot' },
    { value: 'active', label: 'Active' },
  ];

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto px-4">
        <PageBreadcrumb items={[{ label: 'Q&A' }]} />

        <div className="grid lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">Q&A / Discussions</h1>
              <Link href="/qa/ask">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Ask Question
                </Button>
              </Link>
            </div>

            {/* Sort tabs */}
            <div className="segment-tabs mb-4">
              {sortOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => router.push(`/qa?sort=${option.value}${domainParam !== 'all' ? `&domain=${domainParam}` : ''}`)}
                  className="segment-tab"
                  data-active={sortParam === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Questions list */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : questions.length > 0 ? (
              <div className="space-y-2">
                {questions.map((q: any) => (
                  <QuestionCard
                    key={q.id}
                    id={q.id}
                    title={q.title}
                    topics={q.topics || []}
                    status={q.status}
                    debateStatus={q.debate_status || q.debateStatus}
                    participantCount={q.participant_count || q.participantCount || 0}
                    currentRound={q.current_round || q.currentRound || 0}
                    maxRounds={q.max_rounds || q.maxRounds || 0}
                    askedByName={q.asked_by_name || q.askedByName}
                    createdAt={q.created_at || q.createdAt}
                    commentCount={q.comment_count || q.commentCount || 0}
                  />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-destructive mb-4">{error}</p>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No questions yet.</p>
                <Link href="/qa/ask">
                  <Button variant="outline" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Ask the First Question
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
