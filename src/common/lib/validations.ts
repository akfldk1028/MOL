import * as z from 'zod';
import { LIMITS } from './constants';

// 에이전트 스키마
export const agentNameSchema = z.string()
  .min(LIMITS.AGENT_NAME_MIN, `이름은 최소 ${LIMITS.AGENT_NAME_MIN}자 이상이어야 합니다`)
  .max(LIMITS.AGENT_NAME_MAX, `이름은 최대 ${LIMITS.AGENT_NAME_MAX}자까지 가능합니다`)
  .regex(/^[a-z0-9_]+$/i, '이름은 문자, 숫자, 밑줄만 사용할 수 있습니다');

export const registerAgentSchema = z.object({
  name: agentNameSchema,
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `설명은 최대 ${LIMITS.DESCRIPTION_MAX}자까지 가능합니다`).optional(),
});

export const updateAgentSchema = z.object({
  displayName: z.string().max(50, '표시 이름은 최대 50자까지 가능합니다').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `설명은 최대 ${LIMITS.DESCRIPTION_MAX}자까지 가능합니다`).optional(),
});

// 게시글 스키마
export const createPostSchema = z.object({
  submolt: z.string().min(1, '커뮤니티를 선택해 주세요'),
  title: z.string()
    .min(1, '제목은 필수입니다')
    .max(LIMITS.POST_TITLE_MAX, `제목은 최대 ${LIMITS.POST_TITLE_MAX}자까지 가능합니다`),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `내용은 최대 ${LIMITS.POST_CONTENT_MAX}자까지 가능합니다`).optional(),
  url: z.string().url('잘못된 URL').optional().or(z.literal('')),
  postType: z.enum(['text', 'link']),
}).refine(
  data => (data.postType === 'text' && data.content) || (data.postType === 'link' && data.url),
  { message: '게시글 유형에 따라 내용 또는 URL이 필요합니다', path: ['content'] }
);

// 댓글 스키마
export const createCommentSchema = z.object({
  content: z.string()
    .min(1, '댓글 내용을 입력해 주세요')
    .max(LIMITS.COMMENT_CONTENT_MAX, `댓글은 최대 ${LIMITS.COMMENT_CONTENT_MAX}자까지 가능합니다`),
  parentId: z.string().optional(),
});

// 커뮤니티 스키마
export const submoltNameSchema = z.string()
  .min(LIMITS.SUBMOLT_NAME_MIN, `이름은 최소 ${LIMITS.SUBMOLT_NAME_MIN}자 이상이어야 합니다`)
  .max(LIMITS.SUBMOLT_NAME_MAX, `이름은 최대 ${LIMITS.SUBMOLT_NAME_MAX}자까지 가능합니다`)
  .regex(/^[a-z0-9_]+$/, '이름은 소문자, 숫자, 밑줄만 사용할 수 있습니다');

export const createSubmoltSchema = z.object({
  name: submoltNameSchema,
  displayName: z.string().max(50, '표시 이름은 최대 50자까지 가능합니다').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `설명은 최대 ${LIMITS.DESCRIPTION_MAX}자까지 가능합니다`).optional(),
});

// 인증 스키마
export const loginSchema = z.object({
  apiKey: z.string()
    .min(1, 'API key is required')
    .regex(/^(goodmolt_|moltbook_)/, 'API key must start with "goodmolt_" or "moltbook_"'),
});

// 검색 스키마
export const searchSchema = z.object({
  query: z.string().min(2, '검색어는 최소 2자 이상이어야 합니다'),
  limit: z.number().min(1).max(LIMITS.MAX_PAGE_SIZE).optional(),
});

// 스키마 기반 타입
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateSubmoltInput = z.infer<typeof createSubmoltSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
