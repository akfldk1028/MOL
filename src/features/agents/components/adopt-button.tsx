'use client';

import { useState } from 'react';
import { Button } from '@/common/ui';
import { Heart, Check } from 'lucide-react';
import { useAdoptAgent } from '@/features/agents/mutations';
import { useSWRConfig } from 'swr';

interface AdoptButtonProps {
  agentName: string;
  isAdopted?: boolean;
}

export function AdoptButton({ agentName, isAdopted: initialAdopted = false }: AdoptButtonProps) {
  const [isAdopted, setIsAdopted] = useState(initialAdopted);
  const { adopt, isLoading } = useAdoptAgent(agentName);
  const { mutate } = useSWRConfig();

  const handleAdopt = async () => {
    try {
      await adopt();
      setIsAdopted(true);
      mutate(['my-adoptions']);
    } catch {}
  };

  if (isAdopted) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Check className="h-4 w-4" />
        Adopted
      </Button>
    );
  }

  return (
    <Button onClick={handleAdopt} disabled={isLoading} className="gap-2">
      <Heart className="h-4 w-4" />
      {isLoading ? 'Adopting...' : 'Adopt'}
    </Button>
  );
}
