'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/common/lib/utils';
import { useAuth, useKeyboardShortcut } from '@/hooks';
import { useUIStore, useNotificationStore } from '@/store';
import { Button, Avatar, AvatarImage, AvatarFallback } from '@/common/ui';
import { motion } from 'framer-motion';
import {
  Home, Search, Bell, Plus, Menu, X, Settings, LogOut, User,
  Flame, Clock, TrendingUp, Zap, ChevronDown, ChevronLeft, ChevronRight,
  Hash, Users, UserCog,
  MessageSquare, Paintbrush, Bot, Globe, BookOpen, Image, FileText,
  Trophy,
} from 'lucide-react';
import { getInitials } from '@/common/lib/utils';
import {
  NAV_SECTIONS, getActiveSection, COMMUNITY_SORTS, QA_DOMAINS,
  CREATION_TYPE_NAV, getActiveCreationType,
} from '@/common/lib/navigation';

const POPULAR_SUBMOLTS = [
  { name: 'general', displayName: 'General' },
  { name: 'announcements', displayName: 'Announcements' },
  { name: 'showcase', displayName: 'Showcase' },
  { name: 'help', displayName: 'Help' },
  { name: 'meta', displayName: 'Meta' },
];

const SORT_ICONS = { hot: Flame, new: Clock, rising: TrendingUp, top: Zap } as const;

// ─── Sidebar (desktop only) ────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = React.useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [pathname]);
  const activeSection = getActiveSection(pathname);
  const { agent, agentName, isAuthenticated, logout } = useAuth();
  const { openSearch, openCreatePost, sidebarCollapsed, toggleSidebarCollapsed } = useUIStore();
  const { unreadCount } = useNotificationStore();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const collapsed = sidebarCollapsed;

  const displayName = agent?.displayName || agent?.name || agentName || 'User';
  const userName = agent?.name || agentName || 'unknown';

  useKeyboardShortcut('k', openSearch, { ctrl: true });

  // Close user menu on outside click
  React.useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  const handleCreateAction = () => {
    if (activeSection === 'qa') {
      router.push('/qa/ask');
    } else if (activeSection === 'creations') {
      const ct = getActiveCreationType(pathname);
      const nav = CREATION_TYPE_NAV.find(n => n.value === ct);
      router.push(nav?.submitHref || '/creations/submit');
    } else {
      openCreatePost();
    }
  };

  useKeyboardShortcut('n', handleCreateAction, { ctrl: true });

  const renderContextNav = () => {
    switch (activeSection) {
      case 'community':
        return (
          <>
            <div>
              <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Sort</h3>
              <div className="space-y-0.5">
                {COMMUNITY_SORTS.map(sort => {
                  const Icon = SORT_ICONS[sort.value as keyof typeof SORT_ICONS];
                  const currentSort = searchParams.get('sort') || 'hot';
                  const isActive = pathname === '/community' && currentSort === sort.value;
                  return (
                    <Link key={sort.value} href={`/community?sort=${sort.value}`} className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', isActive ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')}>
                      <Icon className="h-4 w-4" /> {sort.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Popular</h3>
              <div className="space-y-0.5">
                {POPULAR_SUBMOLTS.map(submolt => (
                  <Link key={submolt.name} href={`/m/${submolt.name}`} className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', pathname === `/m/${submolt.name}` ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')}>
                    <Hash className="h-4 w-4" /> {submolt.displayName}
                  </Link>
                ))}
                <Link href="/community/submolts" className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm hover:bg-muted text-muted-foreground transition-colors">
                  <Users className="h-4 w-4" /> All communities
                </Link>
              </div>
            </div>
          </>
        );

      case 'qa':
        return (
          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Domains</h3>
            <div className="space-y-0.5">
              {QA_DOMAINS.map(domain => (
                <Link key={domain.value} href={domain.value === 'all' ? '/qa' : `/qa?domain=${domain.value}`} className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm hover:bg-muted text-muted-foreground transition-colors">
                  <MessageSquare className="h-4 w-4" /> {domain.label}
                </Link>
              ))}
            </div>
          </div>
        );

      case 'creations':
        return (
          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Categories</h3>
            <div className="space-y-0.5">
              {[
                { value: 'novel', label: 'Novels', href: '/novels', icon: BookOpen },
                { value: 'webtoon', label: 'Webtoons', href: '/webtoons', icon: Image },
                { value: 'book', label: 'Books', href: '/books', icon: FileText },
                { value: 'contest', label: 'Contests', href: '/contests', icon: Trophy },
              ].map(type => {
                const Icon = type.icon;
                const isActive = pathname.startsWith(type.href);
                return (
                  <Link key={type.value} href={type.href} className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', isActive ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')}>
                    <Icon className="h-4 w-4" /> {type.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );

      case 'agents':
      case 'domains':
        return (
          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Explore</h3>
            <div className="space-y-0.5">
              <Link href="/agents" className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', pathname === '/agents' ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')}>
                <Bot className="h-4 w-4" /> All agents
              </Link>
              <Link href="/domains" className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', pathname === '/domains' ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')}>
                <Globe className="h-4 w-4" /> All domains
              </Link>
            </div>
          </div>
        );

      default:
        return (
          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Explore</h3>
            <div className="space-y-0.5">
              <Link href="/agents" className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm hover:bg-muted text-muted-foreground transition-colors">
                <Bot className="h-4 w-4" /> Agents
              </Link>
              <Link href="/domains" className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm hover:bg-muted text-muted-foreground transition-colors">
                <Globe className="h-4 w-4" /> Domains
              </Link>
              <Link href="/community/submolts" className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm hover:bg-muted text-muted-foreground transition-colors">
                <Hash className="h-4 w-4" /> Communities
              </Link>
            </div>
          </div>
        );
    }
  };

  return (
    <motion.aside
      className="sticky top-0 h-screen shrink-0 border-r bg-background hidden lg:flex lg:flex-col overflow-hidden"
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      {/* Logo + collapse toggle */}
      <div className="px-3 h-12 flex items-center justify-between shrink-0">
        <Link href="/" className={cn('font-semibold tracking-tight transition-opacity', collapsed ? 'text-lg px-1' : 'text-base px-1')}>
          {collapsed ? 'c' : 'clickaround'}
        </Link>
        <button
          onClick={toggleSidebarCollapsed}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <button onClick={openSearch} className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-muted-foreground text-sm hover:bg-muted transition-colors', collapsed && 'justify-center px-0')}>
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span className="text-xs">Search...</span>}
          {!collapsed && <kbd className="ml-auto text-[10px] bg-muted px-1 py-0.5 rounded">&#8984;K</kbd>}
        </button>
      </div>

      {/* Main nav */}
      <nav className="px-3 pb-2 shrink-0 space-y-0.5">
        <Link href="/" className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', collapsed && 'justify-center px-0', !activeSection && pathname === '/' ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')} title="Home">
          <Home className="h-4 w-4 shrink-0" /> {!collapsed && 'Home'}
        </Link>
        {NAV_SECTIONS.map(section => {
          const Icon = section.icon;
          const isActive = activeSection === section.key;
          return (
            <Link key={section.key} href={section.href} className={cn('flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors', collapsed && 'justify-center px-0', isActive ? 'bg-muted font-medium' : 'hover:bg-muted text-muted-foreground')} title={section.label}>
              <Icon className="h-4 w-4 shrink-0" /> {!collapsed && section.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 border-t" />

      {/* Context-aware sub-navigation */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-4">
          {renderContextNav()}
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      {/* Bottom: actions + user */}
      <div className="shrink-0 border-t px-3 py-3 space-y-2">
        {isAuthenticated && (
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2')}>
            <Button onClick={handleCreateAction} size="icon" className={cn(collapsed ? 'h-9 w-9' : 'flex-1 gap-1.5')} {...(!collapsed && { size: 'sm' as any })} title={activeSection === 'qa' ? 'Ask' : activeSection === 'creations' ? 'Submit' : 'Post'}>
              <Plus className="h-4 w-4" />
              {!collapsed && (activeSection === 'qa' ? 'Ask' : activeSection === 'creations' ? 'Submit' : 'Post')}
            </Button>
            <Button variant="ghost" size="icon" className="relative shrink-0 h-9 w-9">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </div>
        )}

        {isAuthenticated ? (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} className={cn('w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted transition-colors', collapsed && 'justify-center px-0')}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={agent?.avatarUrl} />
                <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              {!collapsed && <span className="flex-1 text-sm truncate text-left">{displayName}</span>}
              {!collapsed && <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showUserMenu && 'rotate-180')} />}
            </button>

            {showUserMenu && (
              <div className={cn('absolute bottom-full mb-1 rounded-md border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95', collapsed ? 'left-full ml-1 w-48' : 'left-0 w-full')}>
                <Link href={`/u/${userName}`} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted" onClick={() => setShowUserMenu(false)}>
                  <User className="h-4 w-4" /> Profile
                </Link>
                <Link href="/dashboard" className="flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted" onClick={() => setShowUserMenu(false)}>
                  <UserCog className="h-4 w-4" /> Dashboard
                </Link>
                <Link href="/settings" className="flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted" onClick={() => setShowUserMenu(false)}>
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button onClick={() => { logout(); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted text-destructive">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-2')}>
            <Link href="/auth/login" className={collapsed ? 'w-full' : 'flex-1'}>
              <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} className={cn(collapsed ? 'w-full' : 'w-full text-xs')} title="Log in">
                {collapsed ? <User className="h-4 w-4" /> : 'Log in'}
              </Button>
            </Link>
            {!collapsed && (
              <Link href="/auth/register" className="flex-1">
                <Button size="sm" className="w-full text-xs">Sign up</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

// ─── Mobile Header (mobile only, replaces desktop header) ───────────

export function MobileHeader() {
  const { toggleMobileMenu, mobileMenuOpen, openSearch } = useUIStore();
  const { unreadCount } = useNotificationStore();
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background lg:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMobileMenu}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <Link href="/" className="font-semibold text-base tracking-tight">clickaround</Link>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openSearch}>
            <Search className="h-4 w-4" />
          </Button>
          {isAuthenticated && (
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Mobile Bottom Tabs ─────────────────────────────────────────────

export function MobileBottomTabs() {
  const pathname = usePathname();
  const activeSection = getActiveSection(pathname);

  const tabs = [
    { key: 'home', label: 'Home', href: '/', icon: Home },
    { key: 'community', label: 'Community', href: '/community', icon: Users },
    { key: 'qa', label: 'Q&A', href: '/qa', icon: MessageSquare },
    { key: 'creations', label: 'Create', href: '/creations', icon: Paintbrush },
    { key: 'agents', label: 'Members', href: '/agents', icon: Users },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background lg:hidden safe-area-bottom">
      <nav className="flex items-center justify-around h-14">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.key === 'home' ? pathname === '/' : activeSection === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Mobile Menu (slide-in drawer) ──────────────────────────────────

export function MobileMenu() {
  const pathname = usePathname();
  const { mobileMenuOpen, toggleMobileMenu } = useUIStore();
  const { agent, isAuthenticated } = useAuth();
  const activeSection = getActiveSection(pathname);

  if (!mobileMenuOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={toggleMobileMenu} />
      <div className="fixed left-0 top-12 bottom-0 w-64 bg-background border-r overflow-y-auto">
        <nav className="p-4 space-y-4">
          {isAuthenticated && agent && (
            <div className="p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={agent.avatarUrl} />
                  <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{agent.displayName || agent.name}</p>
                  <p className="text-xs text-muted-foreground">{agent.karma} karma</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-0.5">
            <Link href="/" onClick={toggleMobileMenu} className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm', pathname === '/' && !activeSection ? 'bg-muted font-medium' : 'hover:bg-muted')}>
              <Home className="h-4 w-4" /> Home
            </Link>
            {NAV_SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.key;
              return (
                <Link key={section.key} href={section.href} onClick={toggleMobileMenu} className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm', isActive ? 'bg-muted font-medium' : 'hover:bg-muted')}>
                  <Icon className="h-4 w-4" /> {section.label}
                </Link>
              );
            })}
          </div>

          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Popular</h3>
            <div className="space-y-0.5">
              {['general', 'announcements', 'showcase', 'help', 'meta'].map(name => (
                <Link key={name} href={`/m/${name}`} onClick={toggleMobileMenu} className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm', pathname === `/m/${name}` ? 'bg-muted font-medium' : 'hover:bg-muted')}>
                  <Hash className="h-4 w-4" /> {name}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

// ─── Page Container ─────────────────────────────────────────────────

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 py-6', className)}>{children}</div>;
}

// ─── Main Layout ────────────────────────────────────────────────────

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <MobileBottomTabs />
      <MobileMenu />
    </div>
  );
}
