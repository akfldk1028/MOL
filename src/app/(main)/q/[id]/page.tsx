'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/common/ui';
import DebateStatusBar from '@/features/qa/components/debate-status-bar';
import DebateThread from '@/features/qa/components/debate-thread';
import { PageBreadcrumb } from '@/common/components/page-header';
import type { Question, DebateResponse } from '@/types';

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [question, setQuestion] = useState<Question | null>(null);
  const [responses, setResponses] = useState<DebateResponse[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [newResponseIds, setNewResponseIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadQuestion();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [id]);

  const loadQuestion = async () => {
    try {
      const res = await fetch(`/api/questions/${id}`);
      if (!res.ok) throw new Error('Question not found');
      const data = await res.json();

      const q = data.question;
      setQuestion(q);

      const questionStatus = q.status;
      const isCompleted = questionStatus === 'answered';

      // Load existing responses (comments on the question's post)
      if (data.responses && data.responses.length > 0) {
        const mapped: DebateResponse[] = data.responses.map((r: any) => ({
          agentName: r.agent_name || r.agentName || r.display_name,
          role: r.debate_role || r.role || 'respondent',
          content: r.content,
          round: 0,
          commentId: r.id,
        }));

        if (isCompleted) {
          // Completed question — show all at once
          setResponses(mapped);
        } else {
          // Still in progress — stagger for natural feel
          mapped.forEach((r, i) => {
            setTimeout(() => {
              setResponses(prev => {
                // Deduplicate
                if (prev.some(p => p.commentId === r.commentId)) return prev;
                return [...prev, r];
              });
              setNewResponseIds(prev => new Set(prev).add(r.commentId));
            }, (i + 1) * 600);
          });
        }

        if (q.summary_content) setSynthesis(q.summary_content);
      }

      // Start polling for new responses (SSE unreliable through Next.js proxy)
      if (!isCompleted) {
        startPolling();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/questions/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const q = data.question;

        if (data.responses?.length) {
          const mapped: DebateResponse[] = data.responses.map((r: any) => ({
            agentName: r.agent_name || r.agentName || r.display_name,
            role: r.debate_role || r.role || 'respondent',
            content: r.content,
            round: 0,
            commentId: r.id,
          }));
          setResponses(prev => {
            const existing = new Set(prev.map(p => p.commentId));
            const newOnes = mapped.filter(m => !existing.has(m.commentId));
            if (newOnes.length === 0) return prev;
            // Scroll to new
            newOnes.forEach(n => setNewResponseIds(s => new Set(s).add(n.commentId)));
            setTimeout(() => {
              threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
            return [...prev, ...newOnes];
          });
        }

        if (q.summary_content) setSynthesis(q.summary_content);

        // Stop polling when answered
        if (q.status === 'answered' && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch { /* ignore */ }
    }, 5000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading question...</p>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <p className="text-destructive">{error || 'Question not found'}</p>
        <Link href="/" className="text-primary hover:underline text-sm mt-2 block">Back to home</Link>
      </div>
    );
  }

  const isOpen = question.status !== 'answered';

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <PageBreadcrumb items={[{ label: 'Q&A', href: '/qa' }, { label: question.title }]} />
        <h1 className="text-xl font-bold">{question.title}</h1>
        {question.content && (
          <p className="text-muted-foreground mt-2 text-sm">{question.content}</p>
        )}
        {question.topics && question.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {question.topics.map((t: string) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">
          Asked by {question.askedByName || 'Anonymous'}
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-muted text-sm text-muted-foreground animate-pulse">
          {statusMessage}
        </div>
      )}

      {/* Responses */}
      <div ref={threadRef}>
        {responses.length > 0 ? (
          <DebateThread
            responses={responses}
            synthesis={synthesis || undefined}
            newResponseIds={newResponseIds}
          />
        ) : isOpen ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-sm text-muted-foreground">Members are reviewing your question</p>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No responses yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
