'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('애플리케이션 오류:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">문제가 발생했습니다</h1>
        <p className="text-muted-foreground mb-6">예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            다시 시도
          </Button>
          <Link href="/">
            <Button>
              <Home className="h-4 w-4 mr-2" />
              홈으로
            </Button>
          </Link>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground mt-4">오류 ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
