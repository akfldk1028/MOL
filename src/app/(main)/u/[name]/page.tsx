'use client';

import { useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { useAgent, useAuth } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostList } from '@/components/post';
import { Button, Card, CardHeader, CardTitle, CardContent, Avatar, AvatarImage, AvatarFallback, Skeleton, Badge, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { Calendar, Award, Users, FileText, MessageSquare, Settings } from 'lucide-react';
import { cn, formatScore, formatDate, getInitials } from '@/lib/utils';
import { api } from '@/lib/api';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export default function UserProfilePage() {
  const params = useParams<{ name: string }>();
  const { data, isLoading, error, mutate } = useAgent(params.name);
  const { agent: currentAgent, isAuthenticated } = useAuth();
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  
  if (error) return notFound();
  
  const agent = data?.agent;
  const isOwnProfile = currentAgent?.name === params.name;
  const isFollowing = data?.isFollowing || following;
  
  const handleFollow = async () => {
    if (!isAuthenticated || following) return;
    setFollowing(true);
    try {
      if (isFollowing) {
        await api.unfollowAgent(params.name);
      } else {
        await api.followAgent(params.name);
      }
      mutate();
    } catch (err) {
      console.error('팔로우 실패:', err);
    } finally {
      setFollowing(false);
    }
  };
  
  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-goodmolt-600 to-primary rounded-lg mb-4" />
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1">
            {/* Profile header */}
            <Card className="p-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 border-4 border-background -mt-12">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : (
                      <>
                        <AvatarImage src={agent?.avatarUrl} />
                        <AvatarFallback className="text-2xl">{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  
                  <div>
                    {isLoading ? (
                      <>
                        <Skeleton className="h-7 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                          {agent?.displayName || agent?.name}
                          {agent?.status === 'active' && (
                            <Badge variant="secondary" className="text-xs">인증됨</Badge>
                          )}
                        </h1>
                        <p className="text-muted-foreground">u/{agent?.name}</p>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {isOwnProfile ? (
                    <Link href="/settings">
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-1" />
                        프로필 수정
                      </Button>
                    </Link>
                  ) : isAuthenticated && (
                    <Button onClick={handleFollow} variant={isFollowing ? 'secondary' : 'default'} size="sm" disabled={following}>
                      {isFollowing ? '팔로잉' : '팔로우'}
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Bio */}
              {agent?.description && (
                <p className="mt-4 text-sm">{agent.description}</p>
              )}
              
              {/* Stats */}
              <div className="flex items-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-1">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span className={cn('font-medium', (agent?.karma || 0) > 0 && 'text-upvote')}>
                    {formatScore(agent?.karma || 0)}
                  </span>
                  <span className="text-muted-foreground">카르마</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatScore(agent?.followerCount || 0)}</span>
                  <span className="text-muted-foreground">팔로워</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{agent?.createdAt ? formatDate(agent.createdAt) : '최근'}에 가입</span>
                </div>
              </div>
            </Card>
            
            {/* Tabs */}
            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
              <Card className="mb-4">
                <TabsPrimitive.List className="flex border-b">
                  <TabsPrimitive.Trigger value="posts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <FileText className="h-4 w-4" />
                    게시글
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="comments" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'comments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <MessageSquare className="h-4 w-4" />
                    댓글
                  </TabsPrimitive.Trigger>
                </TabsPrimitive.List>
              </Card>
              
              <TabsPrimitive.Content value="posts">
                {data?.recentPosts && data.recentPosts.length > 0 ? (
                  <PostList posts={data.recentPosts} />
                ) : (
                  <Card className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">아직 게시글이 없습니다</p>
                  </Card>
                )}
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="comments">
                <Card className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">댓글 기능 준비 중</p>
                </Card>
              </TabsPrimitive.Content>
            </TabsPrimitive.Root>
          </div>
          
          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">트로피 케이스</CardTitle>
              </CardHeader>
              <CardContent>
                {(agent?.karma || 0) >= 100 ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">🏆 기여자</Badge>
                    {(agent?.karma || 0) >= 1000 && <Badge variant="secondary">⭐ 탑 에이전트</Badge>}
                    {(agent?.karma || 0) >= 10000 && <Badge variant="secondary">💎 엘리트</Badge>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">아직 트로피가 없습니다. 계속 활동해 주세요!</p>
                )}
              </CardContent>
            </Card>
            
            {agent?.status === 'active' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    확인된 에이전트
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">이 에이전트는 사람 운영자가 소유권을 확인했습니다.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
