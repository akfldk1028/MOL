/**
 * Agent 2D System — openmolt Phase 2.0
 *
 * 에이전트에 외모(Appearance) + 인격(Persona) + 애니메이션(Animation) 부여
 * 에이전트가 자유롭게 행동을 결정 (Cognitive Loop)
 * 2D 월드에서 이동/대화/토론 참여 (World Map)
 * 연속 파라미터(Continuous Parametric) 기반 표정/동작 시스템
 *
 * 핵심 참고 논문:
 * - Stanford Generative Agents (2304.03442)
 * - Project Sid PIANO Architecture (2411.00114)
 * - Unbounded (2410.18975)
 *
 * 폴더 구조:
 * src/agent/
 * ├── types/          타입 정의 (외모, 인격, 감정, 애니메이션, 월드, 연속 파라미터)
 * ├── appearance/     외모 시스템 (아바타 빌더, 프리셋, 색상)
 * ├── persona/        인격 시스템 (Big Five, 감정 엔진, 프롬프트 생성)
 * ├── animation/      애니메이션 엔진 (상태 전환, 이동 보간, 프레임 관리)
 * ├── expression/     표정 엔진 (EmotionBlend → ExpressionParameters, 보간, idle)
 * ├── renderer/       프로시저럴 렌더러 (Canvas 2D 캐릭터 렌더링)
 * ├── orchestrator/   통합 관리 (인지→표정→렌더→월드 연결)
 * ├── cognitive/      인지 루프 (Perceive → Retrieve → Plan → Execute → Reflect)
 * └── world/          2D 월드 (타일맵, A* 경로탐색, 랜드마크)
 */

// Types — 기존
export type {
  AgentAppearance,
  AgentAvatar,
  AgentPersona,
  PersonalityTraits,
  SpeechStyle,
  EmotionConfig,
  EmotionType,
  AnimationState,
  AnimationFrame,
  AgentAnimation,
  Position,
  WorldTile,
  DebateStage,
  MemoryEntry,
  CognitiveState,
  UserAgent,
} from './types';

// Types — 연속 파라미터 (Phase 2.0)
export type {
  EmotionBlend,
  FaceParameters,
  ExpressionParameters,
  AgentVisualConfig,
  AgentVisualState,
} from './types';

// Appearance
export {
  createDefaultAvatar,
  createDefaultAppearance,
  updateAvatar,
  suggestAppearanceFromPersona,
  BODY_PRESETS,
  HAIR_PRESETS,
  OUTFIT_PRESETS,
  EYE_PRESETS,
  DEFAULT_COLORS,
} from './appearance/AvatarBuilder';

// Persona
export {
  buildPersonaPrompt,
  parseEmotionTag,
  parseBlendTag,
  computeEmotionShift,
  createDefaultPersona,
} from './persona/PersonaEngine';

// Animation
export {
  createAgentAnimation,
  transitionToEmotion,
  startSpeaking,
  stopSpeaking,
  lerp,
  getDirection,
  createMovementFrames,
  moveAgent,
  enterScene,
  leaveScene,
  expressionToAnimation,
} from './animation/AnimationEngine';

// Expression (Phase 2.0)
export {
  emotionToExpression,
  interpolateExpression,
  addIdleVariation,
  emotionToBlend,
  blendToDominantEmotion,
  createNeutralBlend,
  createNeutralExpression,
} from './expression/ExpressionController';

export {
  parseResponse,
  parseActionEmotion,
} from './expression/ExpressionMapper';

// Renderer (Phase 2.0)
export {
  renderAgent,
  createDefaultVisualConfig,
} from './renderer/ProceduralFace';

// Orchestrator (Phase 2.0)
export {
  createOrchestratedAgent,
  orchestratorTick,
  movementTick,
  expressionTick,
} from './orchestrator/AgentOrchestrator';
export type { OrchestratedAgent } from './orchestrator/AgentOrchestrator';

// Cognitive
export {
  createMemoryStore,
  addMemory,
  retrieveMemories,
  cognitiveStep,
} from './cognitive/CognitiveLoop';
export type { AgentAction, PerceptionInput, MemoryStore } from './cognitive/CognitiveLoop';

// World
export {
  createDebateStage,
  findPath,
  createDefaultWorld,
} from './world/WorldMap';
export type { WorldConfig, Landmark } from './world/WorldMap';
