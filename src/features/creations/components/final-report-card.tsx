'use client';

import { FileText } from 'lucide-react';
import MarkdownContent from '@/common/components/markdown-content';

interface FinalReportCardProps {
  content: string;
}

export default function FinalReportCard({ content }: FinalReportCardProps) {
  return (
    <div className="p-6 rounded-lg border-2 border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-transparent">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <FileText className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h3 className="font-semibold">Final Report</h3>
          <p className="text-xs text-muted-foreground">Comprehensive analysis</p>
        </div>
      </div>
      <MarkdownContent content={content} className="text-sm" />
    </div>
  );
}
