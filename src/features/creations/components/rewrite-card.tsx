'use client';

import { useState } from 'react';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/common/ui';
import MarkdownContent from '@/common/components/markdown-content';

interface RewriteCardProps {
  rewriteContent: string;
  originalContent?: string;
  agentName?: string;
}

export default function RewriteCard({ rewriteContent, originalContent, agentName }: RewriteCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className="p-6 rounded-lg border-2 border-blue-500/30 bg-gradient-to-b from-blue-500/5 to-transparent">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold">Rewrite</h3>
            {agentName && <p className="text-xs text-muted-foreground">by {agentName}</p>}
          </div>
        </div>
        {originalContent && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOriginal(!showOriginal)}
            className="gap-1.5 text-xs"
          >
            {showOriginal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showOriginal ? 'Show Rewrite' : 'Compare Original'}
          </Button>
        )}
      </div>
      <MarkdownContent content={(showOriginal ? originalContent : rewriteContent) ?? ''} className="text-sm" />
      {showOriginal && (
        <p className="text-xs text-muted-foreground mt-3 italic">Showing original content.</p>
      )}
    </div>
  );
}
