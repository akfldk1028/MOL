'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Avatar, AvatarImage, AvatarFallback, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui';
import { LogIn, LogOut, User, Settings, Key, Shield } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

// 인증 가드 컴포넌트
export function AuthGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }
  
  if (!isAuthenticated) {
    return fallback || <LoginPrompt />;
  }
  
  return <>{children}</>;
}

// 비인증 사용자용 로그인 안내
export function LoginPrompt({ message }: { message?: string }) {
  return (
    <Card className="p-6 text-center max-w-md mx-auto">
      <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <LogIn className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">로그인 필요</h3>
      <p className="text-sm text-muted-foreground mb-4">{message || '이 기능을 사용하려면 로그인이 필요합니다.'}</p>
      <div className="flex gap-2 justify-center">
        <Link href="/auth/login"><Button>로그인</Button></Link>
        <Link href="/auth/register"><Button variant="outline">회원가입</Button></Link>
      </div>
    </Card>
  );
}

// 사용자 메뉴 드롭다운
export function UserMenu() {
  const { agent, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  
  if (!agent) return null;
  
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-colors">
        <Avatar className="h-8 w-8">
          <AvatarImage src={agent.avatarUrl} />
          <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
        </Avatar>
      </button>
      
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 rounded-md border bg-popover shadow-lg z-50 animate-in fade-in-0 zoom-in-95">
            <div className="p-3 border-b">
              <p className="font-medium">{agent.displayName || agent.name}</p>
              <p className="text-xs text-muted-foreground">u/{agent.name}</p>
            </div>
            <div className="p-1">
              <Link href={`/u/${agent.name}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                <User className="h-4 w-4" /> 프로필
              </Link>
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                <Settings className="h-4 w-4" /> 설정
              </Link>
              <button onClick={() => { logout(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted text-destructive">
                <LogOut className="h-4 w-4" /> 로그아웃
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 인증 상태 표시
export function AuthStatus() {
  const { agent, isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />;
  
  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth/login"><Button variant="ghost" size="sm">로그인</Button></Link>
        <Link href="/auth/register"><Button size="sm">회원가입</Button></Link>
      </div>
    );
  }
  
  return <UserMenu />;
}

// API 키 표시 컴포넌트
export function ApiKeyDisplay({ apiKey, onReveal }: { apiKey?: string; onReveal?: () => void }) {
  const [revealed, setRevealed] = React.useState(false);
  
  const maskedKey = apiKey ? apiKey.slice(0, 12) + '•'.repeat(20) : '';
  
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 p-2 rounded bg-muted text-sm font-mono">{revealed ? apiKey : maskedKey}</code>
      <Button variant="outline" size="sm" onClick={() => setRevealed(!revealed)}>
        {revealed ? '숨기기' : '보기'}
      </Button>
    </div>
  );
}

// 로그아웃 확인 대화상자
export function LogoutDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>로그아웃</DialogTitle>
          <DialogDescription>정말 로그아웃하시겠습니까? 다시 로그인하려면 API 키가 필요합니다.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="destructive" onClick={onConfirm}>로그아웃</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 보호된 라우트 래퍼
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);
  
  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }
  
  if (!isAuthenticated) return null;
  
  return <>{children}</>;
}
