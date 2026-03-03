/**
 * Persona Engine — 에이전트 인격/성격 시스템
 *
 * Big Five 성격 모델 기반
 * LLM 프롬프트에 성격이 반영되도록 시스템 프롬프트 생성
 */

import type { AgentPersona, PersonalityTraits, EmotionType, EmotionConfig, EmotionBlend } from '../types';

/**
 * 성격 특성에서 시스템 프롬프트 생성
 * 기존 openmolt의 에이전트 persona와 연동
 */
export function buildPersonaPrompt(persona: AgentPersona): string {
  const traitDesc = describeTraits(persona.traits);
  const speechDesc = describeSpeechStyle(persona.speechStyle);

  return [
    `You are ${persona.name}.`,
    persona.bio,
    '',
    `Personality: ${traitDesc}`,
    `Speaking style: ${speechDesc}`,
    persona.speechStyle.quirks.length > 0
      ? `Quirks: ${persona.speechStyle.quirks.join(', ')}`
      : '',
    '',
    `When responding, express your emotion as a tag at the start.`,
    `Preferred: [BLEND:{"joy":0.8,"surprise":0.3}] (Plutchik 8 emotions, each 0-1)`,
    `Also accepted: [EMOTION:happy] (legacy format)`,
    `This drives your character's visual animation.`,
  ].filter(Boolean).join('\n');
}

function describeTraits(t: PersonalityTraits): string {
  const parts: string[] = [];

  if (t.openness > 0.7) parts.push('creative and open-minded');
  else if (t.openness < 0.3) parts.push('practical and conventional');

  if (t.conscientiousness > 0.7) parts.push('organized and thorough');
  else if (t.conscientiousness < 0.3) parts.push('flexible and spontaneous');

  if (t.extraversion > 0.7) parts.push('energetic and outgoing');
  else if (t.extraversion < 0.3) parts.push('reserved and reflective');

  if (t.agreeableness > 0.7) parts.push('warm and cooperative');
  else if (t.agreeableness < 0.3) parts.push('direct and competitive');

  if (t.neuroticism > 0.7) parts.push('emotionally sensitive');
  else if (t.neuroticism < 0.3) parts.push('calm and steady');

  return parts.join(', ') || 'balanced personality';
}

function describeSpeechStyle(s: { formality: string; tone: string }): string {
  return `${s.formality} tone, ${s.tone}`;
}

const VALID_EMOTION_TYPES: Set<string> = new Set([
  'neutral', 'happy', 'excited', 'confident', 'thinking',
  'surprised', 'skeptical', 'disagreeing', 'agreeing',
  'sad', 'angry', 'curious',
]);

/**
 * LLM 응답에서 감정 태그 파싱
 * "[EMOTION:happy] 네 의견에 동의합니다" → { emotion: 'happy', text: '네 의견에 동의합니다' }
 * 유효하지 않은 emotion이면 'neutral' 폴백
 */
export function parseEmotionTag(response: string): {
  emotion: EmotionType;
  text: string;
} {
  const match = response.match(/\[EMOTION:(\w+)\]\s*/);

  if (match) {
    const raw = match[1];
    const emotion: EmotionType = VALID_EMOTION_TYPES.has(raw)
      ? raw as EmotionType
      : 'neutral';
    const text = response.replace(match[0], '').trim();
    return { emotion, text };
  }

  return { emotion: 'neutral', text: response };
}

/**
 * LLM 응답에서 EmotionBlend 태그 파싱 (신규 형식)
 * "[BLEND:{"joy":0.8}] 텍스트" → { blend, text }
 */
export function parseBlendTag(response: string): {
  blend: EmotionBlend | null;
  text: string;
} {
  const match = response.match(/\[BLEND:(\{[^}]+\})\]\s*/);

  if (match) {
    try {
      const raw = JSON.parse(match[1]);
      const blend: EmotionBlend = {
        joy: clamp01(raw.joy || 0),
        anger: clamp01(raw.anger || 0),
        sadness: clamp01(raw.sadness || 0),
        surprise: clamp01(raw.surprise || 0),
        disgust: clamp01(raw.disgust || 0),
        fear: clamp01(raw.fear || 0),
        trust: clamp01(raw.trust || 0),
        anticipation: clamp01(raw.anticipation || 0),
      };
      const text = response.replace(match[0], '').trim();
      return { blend, text };
    } catch {
      // JSON 파싱 실패
    }
  }

  return { blend: null, text: response };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 상황에 따른 감정 변화 계산
 * volatility가 높을수록 감정 변화가 큼
 */
export function computeEmotionShift(
  config: EmotionConfig,
  trigger: { type: 'agree' | 'disagree' | 'surprise' | 'question' }
): EmotionType {
  const { volatility } = config;

  const emotionMap: Record<string, EmotionType[]> = {
    agree: ['agreeing', 'happy', 'neutral'],
    disagree: ['disagreeing', 'skeptical', 'angry'],
    surprise: ['surprised', 'curious', 'excited'],
    question: ['thinking', 'curious', 'neutral'],
  };

  const candidates = emotionMap[trigger.type];
  // volatility가 높으면 강한 감정, 낮으면 약한 감정
  const index = volatility > 0.6 ? 0 : volatility > 0.3 ? 1 : 2;

  return candidates[Math.min(index, candidates.length - 1)];
}

/**
 * 기본 페르소나 생성
 */
export function createDefaultPersona(agentId: string, name: string): AgentPersona {
  return {
    agentId,
    name,
    bio: '',
    traits: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    speechStyle: {
      formality: 'neutral',
      tone: 'balanced and thoughtful',
      quirks: [],
      language: 'ko',
    },
    emotionalRange: {
      baseEmotion: 'neutral',
      volatility: 0.5,
      expressiveness: 0.5,
    },
    knowledgeDomains: [],
  };
}
