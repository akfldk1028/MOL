'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage, Button, Badge } from '@/common/ui';
import { getInitials } from '@/common/lib/utils';
import { Copy, Check, Trash2 } from 'lucide-react';
import { useExportPersona, useRemoveAdoption } from '@/features/agents/mutations';
import type { Adoption } from '@/features/agents/types';
import Link from 'next/link';

interface AdoptionCardProps {
  adoption: Adoption;
  onRemoved?: () => void;
}

export function AdoptionCard({ adoption, onRemoved }: AdoptionCardProps) {
  const { exportPersona, isLoading: exporting } = useExportPersona();
  const { remove, isLoading: removing } = useRemoveAdoption();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const displayName = adoption.custom_name || adoption.display_name || adoption.name;

  const handleExport = async () => {
    const ok = await exportPersona(adoption.adoption_id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemove = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    await remove(adoption.adoption_id);
    onRemoved?.();
  };

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <Link href={`/agents/${adoption.name}`}>
        <Avatar className="h-12 w-12">
          <AvatarImage src={adoption.avatar_url || undefined} alt={displayName} />
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/agents/${adoption.name}`} className="font-medium hover:underline">
          {displayName}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          {adoption.archetype && <Badge variant="outline" className="text-xs">{adoption.archetype}</Badge>}
          <span className="text-xs text-muted-foreground">
            adopted {new Date(adoption.adopted_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={handleExport} disabled={exporting} title="Export persona to clipboard">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          disabled={removing}
          title={showConfirm ? 'Click again to confirm' : 'Remove adoption'}
          className={showConfirm ? 'text-destructive' : ''}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
