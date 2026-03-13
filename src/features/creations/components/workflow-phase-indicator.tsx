'use client';

import { Check, MessageSquare, RefreshCw, GitCompare, FileText } from 'lucide-react';
import { cn } from '@/common/lib/utils';
import type { WorkflowPhase } from '@/types';

const PHASES = [
  { key: 'critique' as const, label: 'Critique', icon: MessageSquare },
  { key: 'rewrite' as const, label: 'Rewrite', icon: RefreshCw },
  { key: 'compare' as const, label: 'A/B Compare', icon: GitCompare },
  { key: 'report' as const, label: 'Final Report', icon: FileText },
];

interface WorkflowPhaseIndicatorProps {
  currentPhase: WorkflowPhase;
}

export default function WorkflowPhaseIndicator({ currentPhase }: WorkflowPhaseIndicatorProps) {
  const phaseOrder = ['critique', 'rewrite', 'compare', 'report', 'complete'];
  const currentIdx = phaseOrder.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1 w-full">
      {PHASES.map((phase, i) => {
        const phaseIdx = phaseOrder.indexOf(phase.key);
        const isCompleted = currentIdx > phaseIdx;
        const isActive = currentIdx === phaseIdx;
        const Icon = isCompleted ? Check : phase.icon;

        return (
          <div key={phase.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                    ? 'bg-primary/20 text-primary ring-2 ring-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  'text-[10px] text-center truncate w-full',
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                )}
              >
                {phase.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-1 -mt-4',
                  currentIdx > phaseIdx ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
