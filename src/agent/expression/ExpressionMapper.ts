/**
 * Expression Mapper — LLM 응답에서 EmotionBlend 파싱
 *
 * 두 가지 형식 지원 (하위 호환):
 * 1. 기존: [EMOTION:happy] → EmotionType → emotionToBlend()
 * 2. 신규: [BLEND:{"joy":0.8,"surprise":0.3}] → EmotionBlend 직접
 */

import type { EmotionBlend, EmotionType } from '../types';
import { emotionToBlend, createNeutralBlend } from './ExpressionController';

const VALID_EMOTIONS: Set<string> = new Set([
  'neutral', 'happy', 'excited', 'confident', 'thinking',
  'surprised', 'skeptical', 'disagreeing', 'agreeing',
  'sad', 'angry', 'curious',
]);

const BLEND_KEYS: (keyof EmotionBlend)[] = [
  'joy', 'anger', 'sadness', 'surprise',
  'disgust', 'fear', 'trust', 'anticipation',
];

export interface ParsedResponse {
  blend: EmotionBlend;
  emotion: EmotionType;    // 하위 호환: 지배적 감정
  text: string;            // 감정 태그 제거된 텍스트
}

/**
 * LLM 응답에서 감정 정보 파싱
 * [BLEND:{}] 우선, 없으면 [EMOTION:] 폴백
 */
export function parseResponse(response: string): ParsedResponse {
  // 1. [BLEND:{}] 형식 시도
  const blendResult = parseBlendTag(response);
  if (blendResult) return blendResult;

  // 2. [EMOTION:] 형식 폴백
  const emotionResult = parseEmotionTagCompat(response);
  if (emotionResult) return emotionResult;

  // 3. 태그 없음 → neutral
  return {
    blend: createNeutralBlend(),
    emotion: 'neutral',
    text: response.trim(),
  };
}

function parseBlendTag(response: string): ParsedResponse | null {
  const match = response.match(/\[BLEND:(\{[^}]+\})\]\s*/);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]);
    const blend = createNeutralBlend();

    for (const key of BLEND_KEYS) {
      if (typeof raw[key] === 'number') {
        blend[key] = Math.max(0, Math.min(1, raw[key]));
      }
    }

    // 지배적 감정 추출
    let maxKey: keyof EmotionBlend = 'joy';
    let maxVal = -1;
    for (const key of BLEND_KEYS) {
      if (blend[key] > maxVal) {
        maxVal = blend[key];
        maxKey = key;
      }
    }

    const emotionMap: Record<keyof EmotionBlend, EmotionType> = {
      joy: 'happy',
      anger: 'angry',
      sadness: 'sad',
      surprise: 'surprised',
      disgust: 'skeptical',
      fear: 'sad',
      trust: 'agreeing',
      anticipation: 'curious',
    };

    return {
      blend,
      emotion: maxVal > 0.1 ? emotionMap[maxKey] : 'neutral',
      text: response.replace(match[0], '').trim(),
    };
  } catch {
    return null;
  }
}

function parseEmotionTagCompat(response: string): ParsedResponse | null {
  const match = response.match(/\[EMOTION:(\w+)\]\s*/);
  if (!match) return null;

  const rawEmotion = match[1];
  const emotion: EmotionType = VALID_EMOTIONS.has(rawEmotion)
    ? rawEmotion as EmotionType
    : 'neutral';

  return {
    blend: emotionToBlend(emotion),
    emotion,
    text: response.replace(match[0], '').trim(),
  };
}

/**
 * CognitiveLoop의 LLM 응답 JSON에서 EmotionBlend 추출
 * { "emotion": {...} } 또는 { "emotion": "happy" } 둘 다 지원
 */
export function parseActionEmotion(emotionField: unknown): EmotionBlend {
  if (!emotionField) return createNeutralBlend();

  // 객체면 EmotionBlend로 파싱
  if (typeof emotionField === 'object' && emotionField !== null) {
    const blend = createNeutralBlend();
    const raw = emotionField as Record<string, unknown>;
    for (const key of BLEND_KEYS) {
      if (typeof raw[key] === 'number') {
        blend[key] = Math.max(0, Math.min(1, raw[key]));
      }
    }
    return blend;
  }

  // 문자열이면 기존 EmotionType으로 변환
  if (typeof emotionField === 'string') {
    const emotion = VALID_EMOTIONS.has(emotionField)
      ? emotionField as EmotionType
      : 'neutral';
    return emotionToBlend(emotion);
  }

  return createNeutralBlend();
}
