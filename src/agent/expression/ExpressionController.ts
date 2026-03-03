/**
 * Expression Controller — 연속 파라미터 기반 표정 엔진
 *
 * EmotionBlend (Plutchik 8 감정 벡터) → ExpressionParameters (얼굴/몸 파라미터)
 * 성격(PersonalityTraits)에 따라 표현 강도 조절
 * 보간(interpolation)으로 부드러운 전환
 */

import type {
  EmotionBlend,
  ExpressionParameters,
  PersonalityTraits,
  EmotionType,
} from '../types';

// ─── 기본 표정 (Emotion Basis) ───

/** 각 Plutchik 감정이 "100%"일 때의 표정 파라미터 */
const EMOTION_BASIS: Record<keyof EmotionBlend, ExpressionParameters> = {
  joy: {
    eyeOpenness: 0.7, pupilDilation: 0.5, browRaise: 0.5, browFurrow: 0,
    mouthCurve: 0.8, mouthOpen: 0.3, cheekPuff: 0.3,
    headTilt: 0.1, headNod: 0.2, bodyLean: 0.1, shoulderRaise: 0.1, gestureIntensity: 0.5,
    blinkRate: 0.3, breathRate: 0.2,
  },
  anger: {
    eyeOpenness: 0.9, pupilDilation: 0.3, browRaise: -0.7, browFurrow: 0.9,
    mouthCurve: -0.6, mouthOpen: 0.2, cheekPuff: 0,
    headTilt: -0.1, headNod: -0.3, bodyLean: 0.3, shoulderRaise: 0.5, gestureIntensity: 0.8,
    blinkRate: 0.1, breathRate: 0.4,
  },
  sadness: {
    eyeOpenness: 0.3, pupilDilation: 0.4, browRaise: 0.3, browFurrow: 0.2,
    mouthCurve: -0.5, mouthOpen: 0, cheekPuff: 0,
    headTilt: -0.2, headNod: -0.4, bodyLean: -0.2, shoulderRaise: 0, gestureIntensity: 0.1,
    blinkRate: 0.2, breathRate: 0.1,
  },
  surprise: {
    eyeOpenness: 1.0, pupilDilation: 0.8, browRaise: 0.9, browFurrow: 0,
    mouthCurve: 0, mouthOpen: 0.7, cheekPuff: 0,
    headTilt: 0, headNod: 0.3, bodyLean: -0.2, shoulderRaise: 0.4, gestureIntensity: 0.6,
    blinkRate: 0.05, breathRate: 0.3,
  },
  disgust: {
    eyeOpenness: 0.4, pupilDilation: 0.3, browRaise: -0.3, browFurrow: 0.6,
    mouthCurve: -0.4, mouthOpen: 0.1, cheekPuff: 0.2,
    headTilt: -0.3, headNod: -0.1, bodyLean: -0.3, shoulderRaise: 0.2, gestureIntensity: 0.3,
    blinkRate: 0.2, breathRate: 0.15,
  },
  fear: {
    eyeOpenness: 0.95, pupilDilation: 0.9, browRaise: 0.7, browFurrow: 0.3,
    mouthCurve: -0.2, mouthOpen: 0.4, cheekPuff: 0,
    headTilt: 0, headNod: -0.2, bodyLean: -0.4, shoulderRaise: 0.6, gestureIntensity: 0.4,
    blinkRate: 0.5, breathRate: 0.5,
  },
  trust: {
    eyeOpenness: 0.6, pupilDilation: 0.5, browRaise: 0.2, browFurrow: 0,
    mouthCurve: 0.4, mouthOpen: 0.1, cheekPuff: 0.1,
    headTilt: 0.15, headNod: 0.2, bodyLean: 0.2, shoulderRaise: 0, gestureIntensity: 0.3,
    blinkRate: 0.25, breathRate: 0.15,
  },
  anticipation: {
    eyeOpenness: 0.8, pupilDilation: 0.6, browRaise: 0.3, browFurrow: 0.1,
    mouthCurve: 0.1, mouthOpen: 0.1, cheekPuff: 0,
    headTilt: 0.1, headNod: 0.1, bodyLean: 0.3, shoulderRaise: 0.2, gestureIntensity: 0.5,
    blinkRate: 0.15, breathRate: 0.25,
  },
};

/** 중립 표정 (모든 감정 0일 때) */
const NEUTRAL_EXPRESSION: ExpressionParameters = {
  eyeOpenness: 0.5, pupilDilation: 0.4, browRaise: 0, browFurrow: 0,
  mouthCurve: 0, mouthOpen: 0, cheekPuff: 0,
  headTilt: 0, headNod: 0, bodyLean: 0, shoulderRaise: 0, gestureIntensity: 0,
  blinkRate: 0.25, breathRate: 0.15,
};

// ─── Core Functions ───

/**
 * EmotionBlend → ExpressionParameters
 * 각 감정의 basis를 가중합산, 성격으로 강도 조절
 */
export function emotionToExpression(
  blend: EmotionBlend,
  personality?: PersonalityTraits
): ExpressionParameters {
  const result = { ...NEUTRAL_EXPRESSION };
  const keys = Object.keys(NEUTRAL_EXPRESSION) as (keyof ExpressionParameters)[];

  // 각 감정의 basis를 가중합산
  for (const emotionKey of Object.keys(blend) as (keyof EmotionBlend)[]) {
    const weight = blend[emotionKey];
    if (weight <= 0) continue;

    const basis = EMOTION_BASIS[emotionKey];
    for (const paramKey of keys) {
      result[paramKey] += basis[paramKey] * weight;
    }
  }

  // 총 감정 가중치로 정규화 (과포화 방지)
  const totalWeight = Object.values(blend).reduce((sum, v) => sum + v, 0);
  if (totalWeight > 1) {
    for (const key of keys) {
      const neutralVal = NEUTRAL_EXPRESSION[key];
      result[key] = neutralVal + (result[key] - neutralVal) / totalWeight;
    }
  }

  // 성격에 따른 표현 강도 조절
  if (personality) {
    const expressionScale = 0.5 + personality.extraversion * 0.8; // 0.5~1.3
    const stabilityDamper = 1 - personality.neuroticism * 0.3;    // 0.7~1.0 (신경증↑ → 덜 안정)

    for (const key of keys) {
      if (key === 'blinkRate' || key === 'breathRate') continue;
      const neutralVal = NEUTRAL_EXPRESSION[key];
      const delta = result[key] - neutralVal;
      result[key] = neutralVal + delta * expressionScale * stabilityDamper;
    }

    // 신경증 높으면 깜빡임/호흡 빨라짐
    result.blinkRate *= (1 + personality.neuroticism * 0.5);
    result.breathRate *= (1 + personality.neuroticism * 0.3);
  }

  // 값 범위 클램핑
  return clampExpression(result);
}

/**
 * 두 ExpressionParameters 사이 선형 보간
 * t: 0 = from, 1 = to
 */
export function interpolateExpression(
  from: ExpressionParameters,
  to: ExpressionParameters,
  t: number
): ExpressionParameters {
  const clamped = Math.max(0, Math.min(1, t));
  const result = { ...from };

  for (const key of Object.keys(from) as (keyof ExpressionParameters)[]) {
    result[key] = from[key] + (to[key] - from[key]) * clamped;
  }

  return result;
}

/**
 * idle 생동감 추가 — 눈 깜빡임, 미세 호흡, 시선 이동
 */
export function addIdleVariation(
  base: ExpressionParameters,
  timeMs: number
): ExpressionParameters {
  const t = timeMs / 1000; // seconds
  const result = { ...base };

  // 눈 깜빡임: 주기적으로 눈 감았다 뜸
  const blinkPeriod = 1 / Math.max(0.1, base.blinkRate);
  const blinkPhase = (t % blinkPeriod) / blinkPeriod;
  if (blinkPhase > 0.95) {
    // 깜빡임 진행중 (주기의 마지막 5%)
    const blinkT = (blinkPhase - 0.95) / 0.05;
    result.eyeOpenness *= blinkT < 0.5 ? (1 - blinkT * 2) : ((blinkT - 0.5) * 2);
  }

  // 호흡: 미세한 몸 상하 움직임
  const breathPhase = Math.sin(t * Math.PI * 2 * base.breathRate);
  result.shoulderRaise += breathPhase * 0.03;
  result.headNod += breathPhase * 0.01;

  // 미세 시선 이동: 느린 사인파
  result.pupilDilation += Math.sin(t * 0.7) * 0.02;
  result.headTilt += Math.sin(t * 0.3) * 0.02;

  return clampExpression(result);
}

/** 기본 EmotionBlend (모든 감정 0) */
export function createNeutralBlend(): EmotionBlend {
  return {
    joy: 0, anger: 0, sadness: 0, surprise: 0,
    disgust: 0, fear: 0, trust: 0, anticipation: 0,
  };
}

/** 기본 ExpressionParameters */
export function createNeutralExpression(): ExpressionParameters {
  return { ...NEUTRAL_EXPRESSION };
}

// ─── 하위 호환: 기존 EmotionType enum → EmotionBlend ───

const EMOTION_TYPE_TO_BLEND: Record<EmotionType, EmotionBlend> = {
  neutral:     { joy: 0, anger: 0, sadness: 0, surprise: 0, disgust: 0, fear: 0, trust: 0.2, anticipation: 0 },
  happy:       { joy: 0.8, anger: 0, sadness: 0, surprise: 0, disgust: 0, fear: 0, trust: 0.3, anticipation: 0.1 },
  excited:     { joy: 0.7, anger: 0, sadness: 0, surprise: 0.4, disgust: 0, fear: 0, trust: 0, anticipation: 0.6 },
  confident:   { joy: 0.3, anger: 0, sadness: 0, surprise: 0, disgust: 0, fear: 0, trust: 0.7, anticipation: 0.2 },
  thinking:    { joy: 0, anger: 0, sadness: 0, surprise: 0, disgust: 0, fear: 0, trust: 0.1, anticipation: 0.5 },
  surprised:   { joy: 0.2, anger: 0, sadness: 0, surprise: 0.9, disgust: 0, fear: 0.1, trust: 0, anticipation: 0 },
  skeptical:   { joy: 0, anger: 0.2, sadness: 0, surprise: 0, disgust: 0.3, fear: 0, trust: 0, anticipation: 0.2 },
  disagreeing: { joy: 0, anger: 0.4, sadness: 0, surprise: 0, disgust: 0.2, fear: 0, trust: 0, anticipation: 0.1 },
  agreeing:    { joy: 0.4, anger: 0, sadness: 0, surprise: 0, disgust: 0, fear: 0, trust: 0.6, anticipation: 0.1 },
  sad:         { joy: 0, anger: 0, sadness: 0.8, surprise: 0, disgust: 0, fear: 0.1, trust: 0, anticipation: 0 },
  angry:       { joy: 0, anger: 0.9, sadness: 0, surprise: 0, disgust: 0.2, fear: 0, trust: 0, anticipation: 0 },
  curious:     { joy: 0.2, anger: 0, sadness: 0, surprise: 0.3, disgust: 0, fear: 0, trust: 0.1, anticipation: 0.6 },
};

/** 기존 EmotionType enum → EmotionBlend 변환 (하위 호환) */
export function emotionToBlend(emotion: EmotionType): EmotionBlend {
  return { ...(EMOTION_TYPE_TO_BLEND[emotion] ?? EMOTION_TYPE_TO_BLEND.neutral) };
}

/** EmotionBlend → 가장 가까운 EmotionType (디버깅/로깅용) */
export function blendToDominantEmotion(blend: EmotionBlend): EmotionType {
  let bestMatch: EmotionType = 'neutral';
  let bestScore = -Infinity;

  for (const [emotion, refBlend] of Object.entries(EMOTION_TYPE_TO_BLEND) as [EmotionType, EmotionBlend][]) {
    let score = 0;
    for (const key of Object.keys(blend) as (keyof EmotionBlend)[]) {
      score -= Math.pow(blend[key] - refBlend[key], 2);
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emotion;
    }
  }

  return bestMatch;
}

// ─── Helpers ───

function clampExpression(expr: ExpressionParameters): ExpressionParameters {
  return {
    eyeOpenness: clamp01(expr.eyeOpenness),
    pupilDilation: clamp01(expr.pupilDilation),
    browRaise: clampSym(expr.browRaise),
    browFurrow: clamp01(expr.browFurrow),
    mouthCurve: clampSym(expr.mouthCurve),
    mouthOpen: clamp01(expr.mouthOpen),
    cheekPuff: clamp01(expr.cheekPuff),
    headTilt: clampSym(expr.headTilt),
    headNod: clampSym(expr.headNod),
    bodyLean: clampSym(expr.bodyLean),
    shoulderRaise: clamp01(expr.shoulderRaise),
    gestureIntensity: clamp01(expr.gestureIntensity),
    blinkRate: Math.max(0.05, Math.min(2, expr.blinkRate)),
    breathRate: Math.max(0.05, Math.min(1, expr.breathRate)),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampSym(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
