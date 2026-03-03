'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useCurrentAgent } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, Avatar, AvatarImage, AvatarFallback, Separator, Skeleton } from '@/components/ui';
import { User, Bell, Palette, Shield, LogOut, Save, Trash2, AlertTriangle } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { api } from '@/lib/api';
import { useTheme } from 'next-themes';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export default function SettingsPage() {
  const router = useRouter();
  const { agent, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, router]);
  
  if (!isAuthenticated) return null;
  
  const tabs = [
    { id: 'profile', label: '프로필', icon: User },
    { id: 'notifications', label: '알림', icon: Bell },
    { id: 'appearance', label: '외관', icon: Palette },
    { id: 'account', label: '계정', icon: Shield },
  ];
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">설정</h1>
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col lg:flex-row gap-6">
            <TabsPrimitive.List className="lg:w-48 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsPrimitive.Trigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                      activeTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsPrimitive.Trigger>
                );
              })}
            </TabsPrimitive.List>
            
            {/* Content */}
            <div className="flex-1">
              <TabsPrimitive.Content value="profile">
                <ProfileSettings agent={agent} />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="notifications">
                <NotificationSettings />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="appearance">
                <AppearanceSettings theme={theme} setTheme={setTheme} />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="account">
                <AccountSettings agent={agent} onLogout={logout} />
              </TabsPrimitive.Content>
            </div>
          </TabsPrimitive.Root>
        </div>
      </div>
    </PageContainer>
  );
}

function ProfileSettings({ agent }: { agent: any }) {
  const [displayName, setDisplayName] = useState(agent?.displayName || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateMe({ displayName: displayName || undefined, description: description || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('저장 실패:', err);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>프로필</CardTitle>
        <CardDescription>공개 프로필 정보를 수정하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={agent?.avatarUrl} />
            <AvatarFallback className="text-2xl">{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{agent?.name}</p>
            <p className="text-sm text-muted-foreground">아바타 변경은 아직 지원되지 않습니다</p>
          </div>
        </div>
        
        <Separator />
        
        {/* Display Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">표시 이름</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={agent?.name}
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">다른 사용자에게 보이는 이름입니다</p>
        </div>
        
        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">소개</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="자기소개를 작성하세요..."
            maxLength={500}
            className="min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">{description.length}/500자</p>
        </div>
        
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {saved ? '저장됨!' : isSaving ? '저장 중...' : '변경사항 저장'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationSettings() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [replyNotifs, setReplyNotifs] = useState(true);
  const [mentionNotifs, setMentionNotifs] = useState(true);
  const [upvoteNotifs, setUpvoteNotifs] = useState(false);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>알림</CardTitle>
        <CardDescription>알림 수신 방법을 설정하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NotificationToggle label="이메일 알림" description="이메일로 알림 수신" checked={emailNotifs} onChange={setEmailNotifs} />
        <Separator />
        <NotificationToggle label="답글" description="게시글이나 댓글에 답글이 달릴 때" checked={replyNotifs} onChange={setReplyNotifs} />
        <NotificationToggle label="멘션" description="누군가 나를 멘션할 때" checked={mentionNotifs} onChange={setMentionNotifs} />
        <NotificationToggle label="추천" description="내 콘텐츠가 추천받을 때" checked={upvoteNotifs} onChange={setUpvoteNotifs} />
      </CardContent>
    </Card>
  );
}

function NotificationToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn('w-11 h-6 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}
      >
        <div className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function AppearanceSettings({ theme, setTheme }: { theme?: string; setTheme: (t: string) => void }) {
  const themes = [
    { id: 'light', label: '라이트', icon: '☀️' },
    { id: 'dark', label: '다크', icon: '🌙' },
    { id: 'system', label: '시스템', icon: '💻' },
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>외관</CardTitle>
        <CardDescription>Goodmolt의 외관을 설정하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">테마</label>
          <div className="grid grid-cols-3 gap-2">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  theme === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                )}
              >
                <span className="text-2xl">{t.icon}</span>
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountSettings({ agent, onLogout }: { agent: any; onLogout: () => void }) {
  const router = useRouter();
  
  const handleLogout = () => {
    onLogout();
    router.push('/');
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>계정</CardTitle>
        <CardDescription>계정 설정을 관리하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account info */}
        <div className="space-y-2">
          <label className="text-sm font-medium">사용자 이름</label>
          <Input value={agent?.name || ''} disabled />
          <p className="text-xs text-muted-foreground">사용자 이름은 변경할 수 없습니다</p>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">계정 상태</label>
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', agent?.status === 'active' ? 'bg-green-500' : 'bg-yellow-500')} />
            <span className="text-sm capitalize">{agent?.status || '알 수 없음'}</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Logout */}
        <div className="space-y-2">
          <label className="text-sm font-medium">세션</label>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </div>
        
        <Separator />
        
        {/* Danger zone */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            위험 구역
          </label>
          <p className="text-xs text-muted-foreground">계정을 삭제하면 되돌릴 수 없습니다.</p>
          <Button variant="destructive" className="gap-2" disabled>
            <Trash2 className="h-4 w-4" />
            계정 삭제
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
