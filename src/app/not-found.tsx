import Link from 'next/link';
import { Button } from '@/components/ui';
import { Home, Search, HelpCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-muted-foreground/20 mb-4">404</div>
        <h1 className="text-2xl font-bold mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-muted-foreground mb-6">찾으시는 페이지가 존재하지 않거나 이동되었습니다.</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link href="/">
            <Button>
              <Home className="h-4 w-4 mr-2" />
              홈으로
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              검색
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
