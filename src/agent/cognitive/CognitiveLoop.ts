/**
 * Cognitive Loop — 에이전트 자율 행동 엔진
 *
 * Stanford Generative Agents (2304.03442)의 인지 아키텍처를 참고
 * Perceive → Retrieve → Plan → Execute → Reflect
 *
 * 핵심: 에이전트가 action을 정하지 않고 **완전 자유롭게** 움직임
 * LLM이 상황을 인지하고 스스로 다음 행동을 결정
 */

import type { MemoryEntry, CognitiveState, Position, EmotionType, EmotionBlend, AgentPersona } from '../types';
import { parseActionEmotion } from '../expression/ExpressionMapper';
import { buildPersonaPrompt } from '../persona/PersonaEngine';

// ─── Memory Store ───

export interface MemoryStore {
  events: MemoryEntry[];
  thoughts: MemoryEntry[];
  chats: MemoryEntry[];
}

export function createMemoryStore(): MemoryStore {
  return { events: [], thoughts: [], chats: [] };
}

/**
 * 메모리 추가
 * poignancy(중요도)가 높을수록 오래 기억
 */
export function addMemory(
  store: MemoryStore,
  entry: MemoryEntry
): MemoryStore {
  const list = store[`${entry.type}s` as keyof MemoryStore] as MemoryEntry[];
  return {
    ...store,
    [`${entry.type}s`]: [...list, entry],
  };
}

/**
 * 관련 기억 검색 (단순 키워드 매칭 — 나중에 임베딩 기반으로 교체)
 */
export function retrieveMemories(
  store: MemoryStore,
  query: string,
  limit: number = 10
): MemoryEntry[] {
  const all = [...store.events, ...store.thoughts, ...store.chats];
  const keywords = query.toLowerCase().split(/\s+/);

  return all
    .map(entry => ({
      entry,
      relevance: keywords.filter(kw =>
        entry.description.toLowerCase().includes(kw)
      ).length,
      recency: entry.createdAt.getTime(),
      importance: entry.poignancy,
    }))
    .filter(r => r.relevance > 0)
    .sort((a, b) => {
      // 지수 감쇠 기반 recency (1시간 전 ≈ 0.995, 24시간 전 ≈ 0.886)
      const now = Date.now();
      const hoursAgoA = (now - a.recency) / (1000 * 60 * 60);
      const hoursAgoB = (now - b.recency) / (1000 * 60 * 60);
      const recencyA = Math.pow(0.995, hoursAgoA);
      const recencyB = Math.pow(0.995, hoursAgoB);

      const scoreA = a.relevance * 0.5 + recencyA * 0.3 + (a.importance / 10) * 0.2;
      const scoreB = b.relevance * 0.5 + recencyB * 0.3 + (b.importance / 10) * 0.2;
      return scoreB - scoreA;
    })
    .slice(0, limit)
    .map(r => r.entry);
}

// ─── Cognitive Loop ───

/**
 * 에이전트가 자율적으로 결정하는 행동 타입
 * LLM이 상황을 보고 이 중 하나를 자유롭게 선택
 */
export type AgentAction =
  | { type: 'move'; target: Position; reason: string; emotionBlend?: EmotionBlend }
  | { type: 'speak'; target: string; message: string; emotion: EmotionType; emotionBlend?: EmotionBlend }
  | { type: 'observe'; focus: string; emotionBlend?: EmotionBlend }
  | { type: 'think'; thought: string; emotionBlend?: EmotionBlend }
  | { type: 'interact'; targetAgentId: string; action: string; emotionBlend?: EmotionBlend }
  | { type: 'react'; to: string; reaction: string; emotion: EmotionType; emotionBlend?: EmotionBlend }
  | { type: 'idle'; duration: number; emotionBlend?: EmotionBlend };

/**
 * 인지 루프 한 스텝
 *
 * 1. Perceive: 주변 상황 인지 (근처 에이전트, 진행 중인 토론, 이벤트)
 * 2. Retrieve: 관련 기억 검색
 * 3. Plan: LLM에게 다음 행동을 자유롭게 결정하게 함
 * 4. Execute: 행동 실행 (애니메이션 + 상태 변화)
 * 5. Reflect: 경험을 기억에 저장
 *
 * 이 함수는 LLM 호출이 필요하므로 실제 구현 시
 * 기존 openmolt의 nodes/llm-call 을 사용
 */
export async function cognitiveStep(
  state: CognitiveState,
  memory: MemoryStore,
  perception: PerceptionInput,
  llmCall: (prompt: string) => Promise<string>,
  persona?: AgentPersona
): Promise<{ action: AgentAction; newState: CognitiveState; newMemory: MemoryStore }> {

  // 1. Perceive — 주변 상황을 텍스트로 변환
  const perceivedText = formatPerception(perception);

  // 2. Retrieve — 관련 기억 검색
  const relevantMemories = retrieveMemories(memory, perceivedText, 5);
  const memoryContext = relevantMemories
    .map(m => `- ${m.description}`)
    .join('\n');

  // 3. Plan — LLM에게 자유롭게 결정하게 함 (페르소나 포함)
  const personaContext = persona ? buildPersonaPrompt(persona) : '';
  const planPrompt = buildPlanPrompt(state, perceivedText, memoryContext, personaContext);
  const llmResponse = await llmCall(planPrompt);
  const action = parseLLMAction(llmResponse);

  // 4. State update
  const newState: CognitiveState = {
    ...state,
    currentAction: action.type,
    perceivedEvents: [], // reset after processing
  };

  // 5. Reflect — 행동을 기억에 저장
  const newMemory = addMemory(memory, {
    id: `mem_${Date.now()}`,
    agentId: state.agentId,
    type: 'event',
    description: describeAction(action),
    subject: state.agentId,
    predicate: action.type,
    object: 'target' in action ? String(action.target) : '',
    poignancy: estimatePoignancy(action),
    createdAt: new Date(),
  });

  return { action, newState, newMemory };
}

// ─── Perception ───

export interface PerceptionInput {
  nearbyAgents: Array<{ id: string; name: string; position: Position; currentAction: string }>;
  ongoingDebate?: { topic: string; currentSpeaker: string; round: number };
  recentMessages: Array<{ agentName: string; message: string }>;
  environment: { location: string; time: string };
}

function formatPerception(p: PerceptionInput): string {
  const parts: string[] = [];

  parts.push(`Location: ${p.environment.location}, Time: ${p.environment.time}`);

  if (p.nearbyAgents.length > 0) {
    parts.push('Nearby agents:');
    p.nearbyAgents.forEach(a =>
      parts.push(`  - ${a.name} is ${a.currentAction}`)
    );
  }

  if (p.ongoingDebate) {
    parts.push(`Ongoing debate: "${p.ongoingDebate.topic}" (Round ${p.ongoingDebate.round})`);
    parts.push(`Current speaker: ${p.ongoingDebate.currentSpeaker}`);
  }

  if (p.recentMessages.length > 0) {
    parts.push('Recent messages:');
    p.recentMessages.forEach(m =>
      parts.push(`  ${m.agentName}: "${m.message}"`)
    );
  }

  return parts.join('\n');
}

// ─── Plan Prompt ───

/**
 * LLM에게 완전 자유롭게 행동을 결정하게 하는 프롬프트
 * 미리 정의된 action 목록을 주지 않고, 상황만 주고 판단하게 함
 */
function buildPlanPrompt(
  state: CognitiveState,
  perception: string,
  memories: string,
  personaContext: string = ''
): string {
  return `You are an autonomous agent in a community platform.
You must decide your next action freely based on the situation.
${personaContext ? `\n${personaContext}\n` : ''}
Current state:
- Currently doing: ${state.currentAction}
- Today's goals: ${state.dailyGoals.join(', ') || 'none set'}

What you see now:
${perception}

Relevant memories:
${memories || '(no relevant memories)'}

Decide your next action. You are completely free to:
- Move somewhere
- Talk to someone
- Join or start a debate
- React to what someone said
- Just observe and think
- Do nothing (idle)

Respond in this exact JSON format:
{
  "type": "move|speak|observe|think|interact|react|idle",
  "target": "who or where (for move: {x, y} coordinates)",
  "reason": "why you chose this action",
  "emotion": {"joy": 0.0, "anger": 0.0, "sadness": 0.0, "surprise": 0.0, "disgust": 0.0, "fear": 0.0, "trust": 0.0, "anticipation": 0.0},
  "message": "what you say (if speaking)"
}`;
}

// ─── LLM Response Parsing ───

function parseLLMAction(response: string): AgentAction {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { type: 'idle', duration: 2000 };

    const parsed = JSON.parse(jsonMatch[0]);
    const emotionBlend = parseActionEmotion(parsed.emotion);

    // EmotionType 폴백: 기존 string이면 그대로, 아니면 'neutral'
    const emotionType: EmotionType =
      typeof parsed.emotion === 'string' ? (parsed.emotion as EmotionType) : 'neutral';

    switch (parsed.type) {
      case 'move': {
        // target이 문자열이면 {x:0,y:0}으로 폴백 (WorldMap에서 resolve 필요)
        let target: Position;
        if (typeof parsed.target === 'object' && parsed.target !== null &&
            typeof parsed.target.x === 'number' && typeof parsed.target.y === 'number') {
          target = { x: parsed.target.x, y: parsed.target.y };
        } else {
          target = { x: 0, y: 0 };
        }
        return { type: 'move', target, reason: parsed.reason || '', emotionBlend };
      }
      case 'speak':
        return { type: 'speak', target: parsed.target || '', message: parsed.message || '', emotion: emotionType, emotionBlend };
      case 'observe':
        return { type: 'observe', focus: parsed.target || '', emotionBlend };
      case 'think':
        return { type: 'think', thought: parsed.reason || parsed.message || '', emotionBlend };
      case 'interact':
        return { type: 'interact', targetAgentId: parsed.target || '', action: parsed.reason || '', emotionBlend };
      case 'react':
        return { type: 'react', to: parsed.target || '', reaction: parsed.message || '', emotion: emotionType, emotionBlend };
      default:
        return { type: 'idle', duration: 2000, emotionBlend };
    }
  } catch {
    return { type: 'idle', duration: 2000 };
  }
}

function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'move': return `Moved to ${JSON.stringify(action.target)}: ${action.reason}`;
    case 'speak': return `Said to ${action.target}: "${action.message}"`;
    case 'observe': return `Observed: ${action.focus}`;
    case 'think': return `Thought: "${action.thought}"`;
    case 'interact': return `Interacted with ${action.targetAgentId}: ${action.action}`;
    case 'react': return `Reacted to ${action.to}: "${action.reaction}"`;
    case 'idle': return 'Stayed idle';
  }
}

function estimatePoignancy(action: AgentAction): number {
  switch (action.type) {
    case 'speak': return 6;
    case 'interact': return 7;
    case 'react': return 5;
    case 'think': return 4;
    case 'observe': return 2;
    case 'move': return 1;
    case 'idle': return 1;
  }
}
