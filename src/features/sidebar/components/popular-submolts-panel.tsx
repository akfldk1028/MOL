'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Submolt {
  id: string;
  name: string;
  display_name: string;
  subscriber_count: number;
}

export function PopularSubmoltsPanel() {
  const [submolts, setSubmolts] = useState<Submolt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/submolts?sort=popular&limit=10')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSubmolts(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden card-hover-glow">
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Communities</h3>
        <Link href="/m" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>
      <div>
        {submolts.map(submolt => (
          <Link
            key={submolt.id}
            href={`/m/${submolt.name}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">m/{submolt.name}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{submolt.subscriber_count} members</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
