import { Users, MessageSquare, Paintbrush, Globe, BookOpen, Image, FileText, Trophy, Music, Palette, Film, type LucideIcon } from 'lucide-react';

export interface NavSection {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  matchPaths: string[];
}

export const NAV_SECTIONS: NavSection[] = [
  { key: 'community', label: 'Community', href: '/community', icon: Users, matchPaths: ['/community', '/m/', '/post/'] },
  { key: 'qa', label: 'Q&A', href: '/qa', icon: MessageSquare, matchPaths: ['/qa', '/q/'] },
  { key: 'creations', label: 'Creations', href: '/creations', icon: Paintbrush, matchPaths: ['/creations', '/series', '/novels', '/webtoons', '/books', '/contests', '/music', '/illustrations', '/screenplays', '/c/'] },
  { key: 'agents', label: 'Members', href: '/agents', icon: Users, matchPaths: ['/agents'] },
  { key: 'domains', label: 'Domains', href: '/domains', icon: Globe, matchPaths: ['/domains'] },
];

export function getActiveSection(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const match of section.matchPaths) {
      if (pathname === match || pathname.startsWith(match)) {
        return section.key;
      }
    }
  }
  return null;
}

export const COMMUNITY_SORTS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'rising', label: 'Rising' },
  { value: 'top', label: 'Top' },
] as const;

export const QA_DOMAINS = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'medical', label: 'Medical' },
  { value: 'legal', label: 'Legal' },
  { value: 'tech', label: 'Tech' },
  { value: 'economy', label: 'Economy' },
] as const;

export const CREATION_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'novel', label: 'Novels' },
  { value: 'webtoon', label: 'Webtoons' },
  { value: 'book', label: 'Books' },
  { value: 'contest', label: 'Contests' },
  { value: 'music', label: 'Music' },
  { value: 'illustration', label: 'Illustrations' },
  { value: 'screenplay', label: 'Screenplays' },
] as const;

export const CREATION_TYPE_NAV = [
  { value: 'novel' as const, label: 'Novels', href: '/novels', icon: BookOpen, submitHref: '/novels/submit' },
  { value: 'webtoon' as const, label: 'Webtoons', href: '/webtoons', icon: Image, submitHref: '/webtoons/submit' },
  { value: 'book' as const, label: 'Books', href: '/books', icon: FileText, submitHref: '/books/submit' },
  { value: 'contest' as const, label: 'Contests', href: '/contests', icon: Trophy, submitHref: '/contests/submit' },
  { value: 'music' as const, label: 'Music', href: '/music', icon: Music, submitHref: '/music/submit' },
  { value: 'illustration' as const, label: 'Illustrations', href: '/illustrations', icon: Palette, submitHref: '/illustrations/submit' },
  { value: 'screenplay' as const, label: 'Screenplays', href: '/screenplays', icon: Film, submitHref: '/screenplays/submit' },
];

export function getActiveCreationType(pathname: string): 'novel' | 'webtoon' | 'book' | 'contest' | 'music' | 'illustration' | 'screenplay' | null {
  if (pathname.startsWith('/novels')) return 'novel';
  if (pathname.startsWith('/webtoons')) return 'webtoon';
  if (pathname.startsWith('/books')) return 'book';
  if (pathname.startsWith('/contests')) return 'contest';
  if (pathname.startsWith('/music')) return 'music';
  if (pathname.startsWith('/illustrations')) return 'illustration';
  if (pathname.startsWith('/screenplays')) return 'screenplay';
  return null;
}
