/**
 * Agent Orchestrator — 인지→표정→렌더→월드 통합 관리
 *
 * 한 tick 흐름:
 * 1. cognitiveStep() → AgentAction + EmotionBlend
 * 2. emotionToExpression() → ExpressionParameters
 * 3. ProceduralFace 렌더링 (AgentCanvas가 처리)
 * 4. 이동이면 findPath() + position 보간
 */

import type {
  AgentPersona,
  AgentVisualConfig,
  AgentVisualState,
  EmotionBlend,
  ExpressionParameters,
  Position,
} from '../types';
import {
  cognitiveStep,
  createMemoryStore,
  type MemoryStore,
  type AgentAction,
  type PerceptionInput,
} from '../cognitive/CognitiveLoop';
import type { CognitiveState } from '../types';
import {
  emotionToExpression,
  createNeutralExpression,
  createNeutralBlend,
  interpolateExpression,
} from '../expression/ExpressionController';
import { createDefaultVisualConfig } from '../renderer/ProceduralFace';
import { findPath } from '../world/WorldMap';
import type { WorldConfig } from '../world/WorldMap';

export interface OrchestratedAgent {
  id: string;
  persona: AgentPersona;
  visualState: AgentVisualState;
  cognitiveState: CognitiveState;
  memory: MemoryStore;
  currentBlend: EmotionBlend;
  targetExpression: ExpressionParameters;
  path: Position[];         // 이동 경로 (남은 타일들)
  pathIndex: number;
}

/**
 * 오케스트레이션된 에이전트 생성
 */
export function createOrchestratedAgent(
  persona: AgentPersona,
  visualConfig?: AgentVisualConfig,
  startPosition: Position = { x: 15, y: 10 }
): OrchestratedAgent {
  const config = visualConfig || createDefaultVisualConfig();
  const expression = createNeutralExpression();

  return {
    id: persona.agentId,
    persona,
    visualState: {
      agentId: persona.agentId,
      config,
      expression,
      position: startPosition,
      scale: 1,
      opacity: 1,
      direction: 'right',
    },
    cognitiveState: {
      agentId: persona.agentId,
      currentAction: 'idle',
      currentPlan: [],
      dailyGoals: [],
      perceivedEvents: [],
      relevantMemories: [],
      reflections: [],
    },
    memory: createMemoryStore(),
    currentBlend: createNeutralBlend(),
    targetExpression: expression,
    path: [],
    pathIndex: 0,
  };
}

/**
 * 에이전트 인지 스텝 실행
 * LLM을 호출하여 다음 행동 결정 + 감정 업데이트
 */
export async function orchestratorTick(
  agent: OrchestratedAgent,
  perception: PerceptionInput,
  llmCall: (prompt: string) => Promise<string>,
  world?: WorldConfig
): Promise<{ agent: OrchestratedAgent; action: AgentAction }> {
  // 1. Cognitive step
  const { action, newState, newMemory } = await cognitiveStep(
    agent.cognitiveState,
    agent.memory,
    perception,
    llmCall,
    agent.persona
  );

  // 2. 감정 업데이트
  const blend = action.emotionBlend || agent.currentBlend;
  const targetExpression = emotionToExpression(blend, agent.persona.traits);

  // 3. 이동 처리
  let path: Position[] = [];
  let direction = agent.visualState.direction;

  if (action.type === 'move' && world) {
    path = findPath(world, agent.visualState.position, action.target);
    if (path.length > 1) {
      // 이동 방향
      direction = path[1].x >= agent.visualState.position.x ? 'right' : 'left';
    }
  }

  // 4. 상태 업데이트
  const updatedAgent: OrchestratedAgent = {
    ...agent,
    cognitiveState: newState,
    memory: newMemory,
    currentBlend: blend,
    targetExpression,
    path,
    pathIndex: 0,
    visualState: {
      ...agent.visualState,
      expression: targetExpression,
      direction,
      targetPosition: path.length > 0 ? path[path.length - 1] : undefined,
    },
  };

  return { agent: updatedAgent, action };
}

/**
 * 이동 보간 틱 — 매 프레임 호출
 * path를 따라 position 업데이트
 * @returns 이동 완료 여부
 */
export function movementTick(
  agent: OrchestratedAgent,
  deltaMs: number,
  speedMsPerTile: number = 300
): { agent: OrchestratedAgent; done: boolean } {
  if (agent.path.length === 0 || agent.pathIndex >= agent.path.length - 1) {
    return { agent, done: true };
  }

  const from = agent.path[agent.pathIndex];
  const to = agent.path[agent.pathIndex + 1];

  // 보간 진행도
  const progress = deltaMs / speedMsPerTile;
  const newPosition: Position = {
    x: from.x + (to.x - from.x) * Math.min(1, progress),
    y: from.y + (to.y - from.y) * Math.min(1, progress),
  };

  const nextIndex = progress >= 1 ? agent.pathIndex + 1 : agent.pathIndex;
  const done = nextIndex >= agent.path.length - 1;
  const direction = to.x >= from.x ? 'right' as const : 'left' as const;

  return {
    agent: {
      ...agent,
      pathIndex: nextIndex,
      visualState: {
        ...agent.visualState,
        position: done ? to : newPosition,
        direction,
        targetPosition: done ? undefined : agent.path[agent.path.length - 1],
      },
    },
    done,
  };
}

/**
 * 표정 보간 틱 — 매 프레임 호출
 * 현재 표정 → 목표 표정으로 부드럽게 전환
 */
export function expressionTick(
  agent: OrchestratedAgent,
  deltaMs: number,
  transitionMs: number = 500
): OrchestratedAgent {
  const t = Math.min(1, deltaMs / transitionMs);
  const newExpression = interpolateExpression(
    agent.visualState.expression,
    agent.targetExpression,
    t
  );

  return {
    ...agent,
    visualState: {
      ...agent.visualState,
      expression: newExpression,
    },
  };
}
