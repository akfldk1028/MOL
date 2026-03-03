/**
 * Avatar Builder — 에이전트 외모 생성/편집
 *
 * 유저가 자기 에이전트의 외모를 커스터마이징
 * 나중에 Sprite Sheet Diffusion 연동으로 AI 자동 생성 가능
 */

import type { AgentAvatar, AgentAppearance } from '../types';

// 프리셋 목록 — 나중에 에셋이 추가되면 확장
export const BODY_PRESETS = ['default', 'slim', 'stocky', 'tall'] as const;
export const HAIR_PRESETS = ['short', 'long', 'curly', 'ponytail', 'bald', 'bob'] as const;
export const OUTFIT_PRESETS = ['casual', 'formal', 'lab-coat', 'hoodie', 'suit', 'hanbok'] as const;
export const EYE_PRESETS = ['round', 'sharp', 'gentle', 'fierce'] as const;

export const DEFAULT_COLORS = {
  hair: ['#2C1810', '#4A3728', '#8B6914', '#C4A35A', '#E8D5B7', '#B22222', '#4169E1', '#9370DB'],
  skin: ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#5C3A1E'],
  eye: ['#2E1A0E', '#634E34', '#4A7B3F', '#3B7DD8', '#808080'],
  outfit: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560', '#f5f5f5'],
};

export function createDefaultAvatar(): AgentAvatar {
  return {
    body: 'default',
    hair: 'short',
    hairColor: '#2C1810',
    skinColor: '#F1C27D',
    eyes: 'round',
    eyeColor: '#2E1A0E',
    outfit: 'casual',
    outfitColor: '#1a1a2e',
    accessories: [],
  };
}

export function createDefaultAppearance(agentId: string): AgentAppearance {
  return {
    agentId,
    avatar: createDefaultAvatar(),
    style: 'pixel',
  };
}

/**
 * 아바타 변경 사항 적용
 * partial update 지원 — 바뀐 부분만 전달
 */
export function updateAvatar(
  current: AgentAvatar,
  changes: Partial<AgentAvatar>
): AgentAvatar {
  return { ...current, ...changes };
}

/**
 * 페르소나 특성에서 외모 자동 추천
 * 나중에 LLM이나 규칙 기반으로 정교화
 */
export function suggestAppearanceFromPersona(
  traits: { formality: string; extraversion: number }
): Partial<AgentAvatar> {
  const suggestions: Partial<AgentAvatar> = {};

  if (traits.formality === 'academic' || traits.formality === 'formal') {
    suggestions.outfit = 'suit';
  } else if (traits.formality === 'casual') {
    suggestions.outfit = 'hoodie';
  }

  if (traits.extraversion > 0.7) {
    suggestions.eyes = 'round';
    suggestions.hairColor = '#C4A35A'; // 밝은 색
  } else if (traits.extraversion < 0.3) {
    suggestions.eyes = 'gentle';
    suggestions.hairColor = '#2C1810'; // 어두운 색
  }

  return suggestions;
}
