/**
 * Animation Engine — 2D 에이전트 애니메이션 시스템
 *
 * 에이전트의 감정/행동에 따라 애니메이션 상태를 관리
 * 렌더러(PixiJS/Rive/Canvas)와는 분리된 순수 로직 레이어
 */

import type {
  AnimationState,
  AnimationFrame,
  AgentAnimation,
  EmotionType,
  ExpressionParameters,
  Position,
} from '../types';

/**
 * 감정 → 애니메이션 프레임 매핑
 * 각 감정에 맞는 기본 애니메이션 시퀀스 정의
 */
const EMOTION_ANIMATIONS: Record<EmotionType, AnimationFrame[]> = {
  neutral: [
    { state: 'idle', emotion: 'neutral', duration: 2000 },
  ],
  happy: [
    { state: 'reacting', emotion: 'happy', duration: 500 },
    { state: 'idle', emotion: 'happy', duration: 1500 },
  ],
  excited: [
    { state: 'gesturing', emotion: 'excited', duration: 400 },
    { state: 'reacting', emotion: 'excited', duration: 400 },
    { state: 'idle', emotion: 'excited', duration: 1200 },
  ],
  confident: [
    { state: 'gesturing', emotion: 'confident', duration: 600 },
    { state: 'idle', emotion: 'confident', duration: 1400 },
  ],
  thinking: [
    { state: 'thinking', emotion: 'thinking', duration: 2000 },
  ],
  surprised: [
    { state: 'reacting', emotion: 'surprised', duration: 300 },
    { state: 'idle', emotion: 'surprised', duration: 1700 },
  ],
  skeptical: [
    { state: 'reacting', emotion: 'skeptical', duration: 600 },
    { state: 'idle', emotion: 'skeptical', duration: 1400 },
  ],
  disagreeing: [
    { state: 'gesturing', emotion: 'disagreeing', duration: 500 },
    { state: 'reacting', emotion: 'disagreeing', duration: 500 },
    { state: 'idle', emotion: 'disagreeing', duration: 1000 },
  ],
  agreeing: [
    { state: 'reacting', emotion: 'agreeing', duration: 400 },
    { state: 'idle', emotion: 'agreeing', duration: 1600 },
  ],
  sad: [
    { state: 'reacting', emotion: 'sad', duration: 800 },
    { state: 'idle', emotion: 'sad', duration: 1200 },
  ],
  angry: [
    { state: 'gesturing', emotion: 'angry', duration: 400 },
    { state: 'reacting', emotion: 'angry', duration: 400 },
    { state: 'idle', emotion: 'angry', duration: 1200 },
  ],
  curious: [
    { state: 'thinking', emotion: 'curious', duration: 600 },
    { state: 'idle', emotion: 'curious', duration: 1400 },
  ],
};

/**
 * 에이전트 애니메이션 인스턴스 생성
 */
export function createAgentAnimation(
  agentId: string,
  position: Position
): AgentAnimation {
  return {
    agentId,
    currentState: 'idle',
    currentEmotion: 'neutral',
    position,
    frames: EMOTION_ANIMATIONS.neutral,
  };
}

/**
 * 감정 변화 시 애니메이션 전환
 */
export function transitionToEmotion(
  animation: AgentAnimation,
  newEmotion: EmotionType
): AgentAnimation {
  return {
    ...animation,
    currentEmotion: newEmotion,
    frames: EMOTION_ANIMATIONS[newEmotion] || EMOTION_ANIMATIONS.neutral,
  };
}

/**
 * 발언 시작 — talking 상태로 전환
 */
export function startSpeaking(
  animation: AgentAnimation,
  emotion: EmotionType
): AgentAnimation {
  return {
    ...animation,
    currentState: 'talking',
    currentEmotion: emotion,
    frames: [
      { state: 'talking', emotion, duration: 0 }, // duration 0 = 발언 끝날 때까지
    ],
  };
}

/**
 * 발언 종료 — idle로 복귀
 */
export function stopSpeaking(animation: AgentAnimation): AgentAnimation {
  return transitionToEmotion(
    { ...animation, currentState: 'idle' },
    animation.currentEmotion
  );
}

// ─── 이동 (Movement) ───

/**
 * 두 위치 사이 보간 (lerp)
 * 에이전트 이동 애니메이션에 사용
 */
export function lerp(from: Position, to: Position, t: number): Position {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/**
 * 이동 방향 계산
 */
export function getDirection(from: Position, to: Position): 'left' | 'right' {
  return to.x >= from.x ? 'right' : 'left';
}

/**
 * 경로를 따라 이동하는 애니메이션 프레임 생성
 * path: 타일 좌표 배열
 * speed: 타일당 이동 시간(ms)
 */
export function createMovementFrames(
  path: Position[],
  speed: number = 300
): AnimationFrame[] {
  if (path.length < 2) return [];

  return path.slice(1).map((tile, i) => ({
    state: 'walking' as AnimationState,
    emotion: 'neutral' as EmotionType,
    duration: speed,
    direction: getDirection(path[i], tile),
  }));
}

/**
 * 에이전트 위치 업데이트
 */
export function moveAgent(
  animation: AgentAnimation,
  newPosition: Position
): AgentAnimation {
  return {
    ...animation,
    position: newPosition,
    currentState: 'walking',
  };
}

/**
 * 입장/퇴장 애니메이션
 */
export function enterScene(
  animation: AgentAnimation,
  targetPosition: Position
): AgentAnimation {
  return {
    ...animation,
    currentState: 'entering',
    frames: [
      { state: 'entering', emotion: 'neutral', duration: 800 },
      { state: 'walking', emotion: 'neutral', duration: 500,
        direction: getDirection(animation.position, targetPosition) },
      { state: 'idle', emotion: 'neutral', duration: 500 },
    ],
  };
}

export function leaveScene(animation: AgentAnimation): AgentAnimation {
  return {
    ...animation,
    currentState: 'leaving',
    frames: [
      { state: 'leaving', emotion: 'neutral', duration: 800 },
    ],
  };
}

// ─── 연속 파라미터 브릿지 (Phase 2.0) ───

/**
 * ExpressionParameters → 기존 AnimationState/EmotionType 매핑
 * 연속 파라미터와 기존 이산형 시스템 연결
 */
export function expressionToAnimation(expr: ExpressionParameters): {
  state: AnimationState;
  emotion: EmotionType;
} {
  // gestureIntensity 기준으로 상태 결정
  let state: AnimationState = 'idle';
  if (expr.gestureIntensity > 0.6) state = 'gesturing';
  else if (expr.mouthOpen > 0.3) state = 'talking';

  // 표정에서 감정 추론
  let emotion: EmotionType = 'neutral';
  if (expr.mouthCurve > 0.4 && expr.eyeOpenness > 0.5) emotion = 'happy';
  else if (expr.browFurrow > 0.5 && expr.mouthCurve < -0.3) emotion = 'angry';
  else if (expr.eyeOpenness < 0.3 && expr.mouthCurve < -0.2) emotion = 'sad';
  else if (expr.eyeOpenness > 0.8 && expr.browRaise > 0.5) emotion = 'surprised';
  else if (expr.browFurrow > 0.3 && expr.browRaise < -0.2) emotion = 'skeptical';
  else if (expr.headTilt > 0.3 || expr.pupilDilation > 0.6) emotion = 'curious';

  return { state, emotion };
}
