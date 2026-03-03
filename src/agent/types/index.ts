/**
 * 2D Agent System — Core Types
 *
 * openmolt Phase 2.0: 에이전트에 외모 + 인격 + 애니메이션 부여
 * 참고: Stanford Generative Agents (2304.03442), Project Sid (2411.00114)
 */

// ─── 외모 (Appearance) ───

export interface AgentAppearance {
  agentId: string;
  spriteSheet?: string;          // 스프라이트시트 URL (나중에 Sprite Sheet Diffusion 연동)
  avatar: AgentAvatar;           // 2D 캐릭터 구성 요소
  style: 'pixel' | 'anime' | 'cartoon' | 'minimal';
}

export interface AgentAvatar {
  body: string;                  // 체형 프리셋
  hair: string;                  // 머리 스타일
  hairColor: string;
  skinColor: string;
  eyes: string;                  // 눈 모양
  eyeColor: string;
  outfit: string;                // 의상 프리셋
  outfitColor: string;
  accessories: string[];         // 안경, 모자 등
}

// ─── 인격 (Persona) ───

export interface AgentPersona {
  agentId: string;
  name: string;
  bio: string;                   // 배경 스토리
  traits: PersonalityTraits;
  speechStyle: SpeechStyle;
  emotionalRange: EmotionConfig;
  knowledgeDomains: string[];    // 전문 분야
}

export interface PersonalityTraits {
  openness: number;              // 0-1: 새로운 것에 대한 개방성
  conscientiousness: number;     // 0-1: 성실성
  extraversion: number;          // 0-1: 외향성
  agreeableness: number;         // 0-1: 친화성
  neuroticism: number;           // 0-1: 신경성 (Big Five)
}

export interface SpeechStyle {
  formality: 'casual' | 'neutral' | 'formal' | 'academic';
  tone: string;                  // "따뜻하고 공감적인" 등
  quirks: string[];              // 말버릇, 특징적 표현
  language: 'ko' | 'en' | 'ja'; // 주 사용 언어
}

export interface EmotionConfig {
  baseEmotion: EmotionType;      // 기본 감정 상태
  volatility: number;            // 0-1: 감정 변화 폭
  expressiveness: number;        // 0-1: 감정 표현 강도
}

// ─── 감정 (Emotion) ───

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'confident'
  | 'thinking'
  | 'surprised'
  | 'skeptical'
  | 'disagreeing'
  | 'agreeing'
  | 'sad'
  | 'angry'
  | 'curious';

// ─── 애니메이션 (Animation) ───

export type AnimationState =
  | 'idle'
  | 'talking'
  | 'thinking'
  | 'reacting'
  | 'walking'
  | 'entering'
  | 'leaving'
  | 'gesturing';

export interface AnimationFrame {
  state: AnimationState;
  emotion: EmotionType;
  duration: number;              // ms
  direction?: 'left' | 'right';
}

export interface AgentAnimation {
  agentId: string;
  currentState: AnimationState;
  currentEmotion: EmotionType;
  position: Position;
  frames: AnimationFrame[];
}

// ─── 월드/위치 (World) ───

export interface Position {
  x: number;
  y: number;
}

export interface WorldTile {
  x: number;
  y: number;
  type: 'floor' | 'wall' | 'seat' | 'stage' | 'entrance';
  occupiedBy?: string;           // agentId
}

export interface DebateStage {
  id: string;
  name: string;
  seats: Position[];             // 에이전트 착석 위치
  stageCenter: Position;         // 발언자 위치
  audienceArea: Position[];      // 관객 영역
}

// ─── 인지 루프 (Cognitive — Stanford식) ───

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: 'event' | 'thought' | 'chat';
  description: string;
  subject: string;
  predicate: string;
  object: string;
  poignancy: number;             // 1-10: 중요도
  embedding?: number[];          // 벡터 임베딩
  createdAt: Date;
  expiresAt?: Date;
}

export interface CognitiveState {
  agentId: string;
  currentAction: string;
  currentPlan: string[];
  dailyGoals: string[];
  perceivedEvents: MemoryEntry[];
  relevantMemories: MemoryEntry[];
  reflections: string[];
}

// ─── 연속 감정 벡터 (Continuous Parametric) ───

/** Plutchik 8 기본 감정 — 각 0-1 연속값 */
export interface EmotionBlend {
  joy: number;
  anger: number;
  sadness: number;
  surprise: number;
  disgust: number;
  fear: number;
  trust: number;
  anticipation: number;
}

/** 고정 외모 파라미터 — 슬라이더로 생성 */
export interface FaceParameters {
  headShape: number;     // 0-1 (둥근 ↔ 각진)
  eyeSize: number;       // 0-1
  eyeSpacing: number;    // 0-1
  noseSize: number;      // 0-1
  mouthWidth: number;    // 0-1
  browThickness: number; // 0-1
  chinLength: number;    // 0-1
}

/** 실시간 표정 파라미터 — 감정에 따라 변화 */
export interface ExpressionParameters {
  // 얼굴
  eyeOpenness: number;      // 0-1 (감음 ↔ 크게)
  pupilDilation: number;    // 0-1
  browRaise: number;        // -1~1 (찌푸림 ↔ 올림)
  browFurrow: number;       // 0-1
  mouthCurve: number;       // -1~1 (아래 ↔ 위 = 미소)
  mouthOpen: number;        // 0-1
  cheekPuff: number;        // 0-1
  // 몸
  headTilt: number;         // -1~1 (좌 ↔ 우)
  headNod: number;          // -1~1 (아래 ↔ 위)
  bodyLean: number;         // -1~1
  shoulderRaise: number;    // 0-1
  gestureIntensity: number; // 0-1
  // 메타
  blinkRate: number;        // blinks per second
  breathRate: number;       // cycles per second
}

/** 에이전트 시각 설정 (고정 외모 + 색상) */
export interface AgentVisualConfig {
  faceParams: FaceParameters;
  skinColor: string;
  hairColor: string;
  eyeColor: string;
  outfitColor: string;
  outfitStyle: string;      // 프리셋명
  accessoryIds: string[];
}

/** 에이전트 시각 상태 (런타임) */
export interface AgentVisualState {
  agentId: string;
  config: AgentVisualConfig;
  expression: ExpressionParameters;
  position: Position;
  targetPosition?: Position;
  scale: number;
  opacity: number;
  direction: 'left' | 'right';
}

// ─── 유저 커스텀 에이전트 ───

export interface UserAgent {
  id: string;
  userId: string;                // 만든 유저
  appearance: AgentAppearance;
  persona: AgentPersona;
  visualConfig?: AgentVisualConfig; // 연속 파라미터 (Phase 2.0+)
  isPublic: boolean;             // 다른 유저도 사용 가능?
  usageCount: number;            // 토론에 참여한 횟수
  createdAt: Date;
}
