'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui';
import DebateStatusBar from '@/components/qa/DebateStatusBar';
import DebateThread from '@/components/qa/DebateThread';
import type { Question, DebateResponse, DebateStatus, DebateParticipant } from '@/types';

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [question, setQuestion] = useState<Question | null>(null);
  const [responses, setResponses] = useState<DebateResponse[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [debateStatus, setDebateStatus] = useState<DebateStatus>('recruiting');
  const [currentRound, setCurrentRound] = useState(0);
  const [maxRounds, setMaxRounds] = useState(5);
  const [participantCount, setParticipantCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [newResponseIds, setNewResponseIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // 질문 데이터 로드
  useEffect(() => {
    loadQuestion();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [id]);

  const loadQuestion = async () => {
    try {
      const res = await fetch(`/api/questions/${id}`);
      if (!res.ok) throw new Error('Question not found');
      const data = await res.json();

      const q = data.question;
      setQuestion(q);
      setDebateStatus(q.debate_status || q.debateStatus || 'recruiting');
      setCurrentRound(q.current_round || q.currentRound || 0);
      setMaxRounds(q.max_rounds || q.maxRounds || 5);
      setParticipantCount(q.participants?.length || q.participant_count || 0);

      // 기존 응답 로드
      if (data.responses && data.responses.length > 0) {
        const mapped: DebateResponse[] = data.responses.map((r: any) => ({
          agentName: r.agent_name || r.agentName,
          role: r.debate_role || r.role || 'respondent',
          content: r.content,
          round: (r.depth || 0) + 1,
          commentId: r.id,
          llmProvider: r.llm_provider || r.llmProvider,
          llmModel: r.llm_model || r.llmModel,
        }));
        setResponses(mapped);

        // 종합 응답 찾기
        const synthResp = mapped.find(r => r.content.startsWith('## Synthesis'));
        if (synthResp) setSynthesis(synthResp.content);
      }

      if (q.summary_content) setSynthesis(q.summary_content);

      // 토론이 진행 중이면 SSE 연결
      const ds = q.debate_status || q.debateStatus;
      if (ds && ds !== 'completed') {
        connectSSE();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const connectSSE = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(`/api/questions/${id}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setDebateStatus(data.status);
      if (data.message) setStatusMessage(data.message);
      if (data.currentRound) setCurrentRound(data.currentRound);
    });

    es.addEventListener('agents_selected', (e) => {
      const data = JSON.parse(e.data);
      setParticipantCount(data.agents.length);
    });

    es.addEventListener('round_start', (e) => {
      const data = JSON.parse(e.data);
      setCurrentRound(data.round);
      setMaxRounds(data.maxRounds);
    });

    es.addEventListener('agent_thinking', (e) => {
      const data = JSON.parse(e.data);
      setStatusMessage(`${data.agent} is thinking...`);
    });

    es.addEventListener('agent_response', (e) => {
      const data = JSON.parse(e.data) as DebateResponse;
      setResponses(prev => [...prev, data]);
      setNewResponseIds(prev => new Set(prev).add(data.commentId));
      setStatusMessage('');

      // 새 응답 후 스크롤
      setTimeout(() => {
        threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    });

    es.addEventListener('synthesis', (e) => {
      const data = JSON.parse(e.data);
      setSynthesis(data.content);
    });

    es.addEventListener('debate_complete', () => {
      setDebateStatus('completed');
      setStatusMessage('');
      es.close();
    });

    es.onerror = () => {
      // 자동 재연결은 EventSource가 처리
    };
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

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
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

      {/* Status Bar */}
      <div className="mb-6">
        <DebateStatusBar
          status={debateStatus}
          currentRound={currentRound}
          maxRounds={maxRounds}
          participantCount={participantCount}
          message={statusMessage}
        />
      </div>

      {/* Debate Thread */}
      <div ref={threadRef}>
        {responses.length > 0 ? (
          <DebateThread
            responses={responses.filter(r => !r.content.startsWith('## Synthesis'))}
            synthesis={synthesis || undefined}
            newResponseIds={newResponseIds}
          />
        ) : debateStatus !== 'completed' ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Waiting for agents to start discussing...</p>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No responses yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
