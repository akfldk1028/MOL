'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { BookOpen, Image, FileText, Trophy } from 'lucide-react';
import { PageBreadcrumb } from '@/common/components/page-header';
import DebateStatusBar from '@/features/qa/components/debate-status-bar';
import DebateThread from '@/features/qa/components/debate-thread';
import CritiqueSynthesisCard from '@/features/creations/components/critique-synthesis-card';
import WorkflowPhaseIndicator from '@/features/creations/components/workflow-phase-indicator';
import RewriteCard from '@/features/creations/components/rewrite-card';
import ComparisonCard from '@/features/creations/components/comparison-card';
import FinalReportCard from '@/features/creations/components/final-report-card';
import type { Creation, DebateResponse, WorkflowPhase, ComparisonScores } from '@/types';

const TYPE_CONFIG: Record<string, { icon: typeof BookOpen; color: string; label: string; listHref: string; listLabel: string }> = {
  novel: { icon: BookOpen, color: '#8b5cf6', label: 'Novel', listHref: '/novels', listLabel: 'Novels' },
  webtoon: { icon: Image, color: '#ec4899', label: 'Webtoon', listHref: '/webtoons', listLabel: 'Webtoons' },
  book: { icon: FileText, color: '#0ea5e9', label: 'Book Analysis', listHref: '/books', listLabel: 'Books' },
  contest: { icon: Trophy, color: '#f59e0b', label: 'Contest Submission', listHref: '/contests', listLabel: 'Contests' },
};

export default function CritiqueDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [creation, setCreation] = useState<Creation | null>(null);
  const [responses, setResponses] = useState<DebateResponse[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [debateStatus, setDebateStatus] = useState<string>('recruiting');
  const [participantCount, setParticipantCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [newResponseIds, setNewResponseIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Enhanced workflow state
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('critique');
  const [rewriteContent, setRewriteContent] = useState<string | null>(null);
  const [comparisonContent, setComparisonContent] = useState<string | null>(null);
  const [comparisonScores, setComparisonScores] = useState<ComparisonScores | null>(null);
  const [finalReport, setFinalReport] = useState<string | null>(null);

  useEffect(() => {
    loadCreation();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [id]);

  const loadCreation = async () => {
    try {
      const res = await fetch(`/api/creations/${id}`);
      if (!res.ok) throw new Error('Creation not found');
      const data = await res.json();

      const c = data.creation;
      setCreation(c);
      setDebateStatus(c.debate_status || c.debateStatus || 'recruiting');
      setParticipantCount(c.participants?.length || c.participant_count || 0);

      // Load enhanced workflow data
      const phase = c.workflow_phase || c.workflowPhase || 'critique';
      setWorkflowPhase(phase);
      if (c.rewrite_content || c.rewriteContent) setRewriteContent(c.rewrite_content || c.rewriteContent);
      if (c.comparison_content || c.comparisonContent) setComparisonContent(c.comparison_content || c.comparisonContent);
      if (c.comparison_scores || c.comparisonScores) setComparisonScores(c.comparison_scores || c.comparisonScores);
      if (c.final_report || c.finalReport) setFinalReport(c.final_report || c.finalReport);

      // Load existing responses
      if (data.responses && data.responses.length > 0) {
        const mapped: DebateResponse[] = data.responses.map((r: any) => ({
          agentName: r.agent_name || r.agentName,
          role: r.debate_role || r.role || 'respondent',
          content: r.content,
          round: 0,
          commentId: r.id,
        }));
        setResponses(mapped);

        const synthResp = mapped.find(r => r.content.startsWith('## Synthesis') || r.content.startsWith('## Critique') || r.content.startsWith('## Analysis'));
        if (synthResp) setSynthesis(synthResp.content);
      }

      if (c.summary_content) setSynthesis(c.summary_content);

      // Connect SSE if critique in progress
      const ds = c.debate_status || c.debateStatus;
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

    const es = new EventSource(`/api/creations/${id}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setDebateStatus(data.status);
      if (data.message) setStatusMessage(data.message);
    });

    es.addEventListener('agents_selected', (e) => {
      const data = JSON.parse(e.data);
      setParticipantCount(data.agents.length);
    });

    es.addEventListener('agent_thinking', (e) => {
      const data = JSON.parse(e.data);
      setStatusMessage(`${data.agent} is analyzing...`);
    });

    es.addEventListener('agent_response', (e) => {
      const data = JSON.parse(e.data) as DebateResponse;
      setResponses(prev => [...prev, data]);
      setNewResponseIds(prev => new Set(prev).add(data.commentId));
      setStatusMessage('');

      setTimeout(() => {
        threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    });

    es.addEventListener('synthesis', (e) => {
      const data = JSON.parse(e.data);
      setSynthesis(data.content);
    });

    // Enhanced workflow SSE events
    es.addEventListener('phase_change', (e) => {
      const data = JSON.parse(e.data);
      setWorkflowPhase(data.phase);
      setStatusMessage('');
    });

    es.addEventListener('rewrite_complete', (e) => {
      const data = JSON.parse(e.data);
      setRewriteContent(data.content);
      setStatusMessage('');
    });

    es.addEventListener('comparison_complete', (e) => {
      const data = JSON.parse(e.data);
      setComparisonContent(data.content);
      if (data.scores) setComparisonScores(data.scores);
      setStatusMessage('');
    });

    es.addEventListener('final_report', (e) => {
      const data = JSON.parse(e.data);
      setFinalReport(data.content);
      setStatusMessage('');
    });

    es.addEventListener('debate_complete', () => {
      setDebateStatus('completed');
      setWorkflowPhase('complete');
      setStatusMessage('');
      es.close();
    });

    es.onerror = () => {
      // EventSource handles auto-reconnect
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading critique...</p>
      </div>
    );
  }

  if (error || !creation) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <p className="text-destructive">{error || 'Creation not found'}</p>
        <Link href="/" className="text-primary hover:underline text-sm mt-2 block">Back to home</Link>
      </div>
    );
  }

  const typeConfig = TYPE_CONFIG[(creation as any).creation_type || creation.creationType] || TYPE_CONFIG.novel;
  const TypeIcon = typeConfig.icon;
  const hasEnhancedWorkflow = !!(rewriteContent || comparisonContent || finalReport || workflowPhase !== 'critique');

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <PageBreadcrumb items={[{ label: typeConfig.listLabel, href: typeConfig.listHref }, { label: creation.title }]} />
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
          >
            <TypeIcon className="h-3 w-3 inline mr-1" />
            {typeConfig.label}
          </span>
          {creation.genre && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {creation.genre}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold">{creation.title}</h1>
        {creation.wordCount > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {creation.wordCount.toLocaleString()} words
          </p>
        )}
        {creation.tags && creation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {creation.tags.map((t: string) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">
          by {creation.createdByName || 'Anonymous'}
        </div>
      </div>

      {/* Workflow Phase Indicator */}
      {hasEnhancedWorkflow && (
        <div className="mb-6 p-4 rounded-lg bg-muted/30">
          <WorkflowPhaseIndicator currentPhase={workflowPhase} />
        </div>
      )}

      {/* Status Bar */}
      <div className="mb-6">
        <DebateStatusBar
          status={debateStatus as any}
          participantCount={participantCount}
          message={statusMessage}
        />
      </div>

      {/* Critique Thread */}
      <div ref={threadRef}>
        {responses.length > 0 ? (
          <>
            <DebateThread
              responses={responses.filter(r => !r.content.startsWith('## Synthesis') && !r.content.startsWith('## Critique') && !r.content.startsWith('## Analysis'))}
              newResponseIds={newResponseIds}
            />
            {synthesis && (
              <div className="mt-6">
                <CritiqueSynthesisCard content={synthesis} />
              </div>
            )}
          </>
        ) : debateStatus !== 'completed' ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Waiting for critique agents to start analyzing...</p>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No critiques yet.</p>
          </div>
        )}
      </div>

      {/* Enhanced Workflow Results */}
      {rewriteContent && (
        <div className="mt-6">
          <RewriteCard
            rewriteContent={rewriteContent}
            originalContent={creation.content}
          />
        </div>
      )}

      {comparisonContent && (
        <div className="mt-6">
          <ComparisonCard
            content={comparisonContent}
            scores={comparisonScores}
          />
        </div>
      )}

      {finalReport && (
        <div className="mt-6">
          <FinalReportCard content={finalReport} />
        </div>
      )}
    </div>
  );
}
