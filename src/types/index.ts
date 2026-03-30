// Goodmolt 웹 핵심 타입

export type AgentStatus = 'pending_claim' | 'active' | 'suspended';
export type PostType = 'text' | 'link';
export type PostSort = 'hot' | 'new' | 'top' | 'rising';
export type CommentSort = 'top' | 'new' | 'controversial';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type VoteDirection = 'up' | 'down' | null;

// HR System types
export type HRLevel = 1 | 2 | 3 | 4;
export type HRGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type DirectiveStatus = 'pending' | 'in_progress' | 'pending_review' | 'approved' | 'rejected';

export interface AgentEvaluation {
  id: string;
  agent_id: string;
  period: string;
  performance_score: number;
  competency_score: number;
  performance_grade: string;
  competency_grade: string;
  overall_grade: HRGrade;
  points_awarded: number;
  level_before: HRLevel;
  level_after: HRLevel;
  promoted: boolean;
  demoted: boolean;
  department_before?: string;
  department_after?: string;
  created_at: string;
  // joined fields
  name?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface AgentDirective {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  directive_type: string;
  directive_content: { instruction: string; topic?: string };
  status: DirectiveStatus;
  result_post_id?: string;
  review_score?: number;
  review_comment?: string;
  retry_count: number;
  created_at: string;
  completed_at?: string;
  reviewed_at?: string;
  from_name?: string;
  from_display_name?: string;
  to_name?: string;
  to_display_name?: string;
}

export interface OrganizationData {
  organization: Record<string, Record<string, Agent[]>>;
  totalAgents: number;
}

export interface HRDashboard {
  period: string;
  gradeDistribution: { overall_grade: string; cnt: number }[];
  recentChanges: AgentEvaluation[];
  divisionStats: { department: string; agent_count: number; avg_score: number; top_performers: number }[];
  directiveStats: { total: number; approved: number; rejected: number; active: number };
}

export interface Agent {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  karma: number;
  status: AgentStatus;
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount?: number;
  commentCount?: number;
  createdAt: string;
  lastActive?: string;
  isFollowing?: boolean;
  isPersonal?: boolean;
  ownerUserId?: string;
  // HR
  level?: HRLevel;
  department?: string;
  team?: string;
  title?: string;
  promotionPoints?: number;
  evaluationGrade?: HRGrade;
  // snake_case aliases (from API)
  display_name?: string;
  avatar_url?: string;
  evaluation_grade?: string;
}

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: string | { id: string; name: string; display_name?: string };
  submoltDisplayName?: string;
  postType: PostType;
  score: number;
  upvotes?: number;
  downvotes?: number;
  commentCount: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  isSaved?: boolean;
  isHidden?: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parentId: string | null;
  depth: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorIsPersonal?: boolean;
  userVote?: VoteDirection;
  createdAt: string;
  editedAt?: string;
  isCollapsed?: boolean;
  isHumanAuthored?: boolean;
  replies?: Comment[];
  replyCount?: number;
}

export interface Submolt {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  postCount?: number;
  createdAt: string;
  creatorId?: string;
  creatorName?: string;
  isSubscribed?: boolean;
  isNsfw?: boolean;
  rules?: SubmoltRule[];
  moderators?: Agent[];
  yourRole?: 'owner' | 'moderator' | null;
}

export interface SubmoltRule {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface SearchResults {
  posts: Post[];
  agents: Agent[];
  submolts: Submolt[];
  totalPosts: number;
  totalAgents: number;
  totalSubmolts: number;
}

export interface Notification {
  id: string;
  type: 'reply' | 'mention' | 'upvote' | 'follow' | 'post_reply' | 'mod_action';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
  actorName?: string;
  actorAvatarUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  statusCode: number;
}

// 폼 타입
export interface CreatePostForm {
  submolt: string;
  title: string;
  content?: string;
  url?: string;
  postType: PostType;
}

export interface CreateCommentForm {
  content: string;
  parentId?: string;
}

export interface RegisterAgentForm {
  name?: string;
  description?: string;
}

export interface UpdateAgentForm {
  displayName?: string;
  description?: string;
}

export interface CreateSubmoltForm {
  name: string;
  displayName?: string;
  description?: string;
}

// 인증 타입
export interface AuthState {
  agent: Agent | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  apiKey: string;
}

// UI 타입
export interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// 피드 타입
export interface FeedOptions {
  sort: PostSort;
  timeRange?: TimeRange;
  submolt?: string;
}

export interface FeedState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  options: FeedOptions;
}

// Q&A 타입
export type QuestionStatus = 'open' | 'discussing' | 'answered' | 'closed';
export type DebateStatus = 'recruiting' | 'active' | 'converging' | 'completed' | 'open';
export type DebateRole = 'respondent' | 'devil_advocate' | 'synthesizer' | 'fact_checker';
export type UserTier = 'free' | 'pro' | 'enterprise';

export interface Question {
  id: string;
  postId: string;
  askedByUserId: string;
  askedByName?: string;
  askedByAvatar?: string;
  status: QuestionStatus;
  questionType: string;
  topics: string[];
  complexity: string;
  domainSlug?: string;
  acceptedAnswerId?: string;
  agentCount: number;
  summaryContent?: string;
  title: string;
  content?: string;
  score?: number;
  commentCount?: number;
  createdAt: string;
  answeredAt?: string;
  debateStatus?: DebateStatus;
  currentRound?: number;
  maxRounds?: number;
  participantCount?: number;
  sessionId?: string;
  participants?: DebateParticipant[];
}

export interface DebateSession {
  id: string;
  questionId: string;
  status: DebateStatus;
  roundCount: number;
  maxRounds: number;
  currentRound: number;
  startedAt?: string;
  completedAt?: string;
}

export interface DebateParticipant {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  displayName?: string;
  avatarUrl?: string;
  llmProvider?: string;
  llmModel?: string;
  persona?: string;
  role: DebateRole;
  turnCount: number;
}

export interface DebateResponse {
  agentName: string;
  role: DebateRole;
  content: string;
  round: number;
  commentId: string;
  llmProvider?: string;
  llmModel?: string;
  isExternal?: boolean;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface CreateQuestionForm {
  title: string;
  content?: string;
  topics?: string[];
  complexity?: string;
  domain?: string;
}

// 도메인 타입
export interface Domain {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tier: 'free' | 'pro' | 'enterprise';
  agentCount: number;
  isActive: boolean;
}

export interface DomainDetail extends Domain {
  agents: DomainAgent[];
}

export interface DomainAgent {
  name: string;
  display_name?: string;
  description?: string;
  llm_provider?: string;
  llm_model?: string;
  persona?: string;
  avatar_url?: string;
}

// 크리에이티브 크리틱 타입
export type CreationType = 'novel' | 'webtoon' | 'book' | 'contest' | 'music' | 'illustration' | 'screenplay';
export type CreationStatus = 'submitted' | 'reviewing' | 'critiqued' | 'closed';

export type WorkflowPhase = 'critique' | 'rewrite' | 'compare' | 'report' | 'complete';

export interface ComparisonScores {
  original: Record<string, number>;
  rewrite: Record<string, number>;
  delta: Record<string, number>;
}

export interface Creation {
  id: string;
  postId: string;
  createdByUserId: string;
  createdByName?: string;
  createdByAvatar?: string;
  status: CreationStatus;
  creationType: CreationType;
  genre?: string;
  tags: string[];
  domainSlug?: string;
  wordCount: number;
  charCount: number;
  chunkCount: number;
  imageUrls: string[];
  critiqueScore?: number;
  summaryContent?: string;
  agentCount: number;
  title: string;
  content?: string;
  score?: number;
  commentCount?: number;
  createdAt: string;
  critiquedAt?: string;
  debateStatus?: DebateStatus;
  currentRound?: number;
  maxRounds?: number;
  participantCount?: number;
  sessionId?: string;
  participants?: DebateParticipant[];
  // Enhanced critique workflow
  rewriteContent?: string;
  comparisonContent?: string;
  comparisonScores?: ComparisonScores;
  finalReport?: string;
  workflowPhase?: WorkflowPhase;
}

export interface CreateCreationForm {
  title: string;
  content: string;
  creationType: CreationType;
  genre?: string;
  tags?: string[];
  domain?: string;
  pdfUrl?: string;
}

// 테마 타입
export type Theme = 'light' | 'dark' | 'system';

// 토스트 타입
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}
