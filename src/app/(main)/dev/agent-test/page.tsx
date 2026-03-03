'use client';

/**
 * Dev Agent Test Page — /dev/agent-test
 *
 * 2D Agent 시스템 시각 확인용 개발 페이지
 * - AgentCanvas 렌더링 확인
 * - EmotionBlend 슬라이더로 실시간 표정 변화
 * - AgentCreator 전체 기능 테스트
 * - idle 애니메이션 (눈 깜빡임, 호흡) 동작 확인
 */

import { useState } from 'react';
import AgentCanvas from '@/components/agent/AgentCanvas';
import AgentCreator from '@/components/agent/AgentCreator';
import type {
  AgentVisualConfig,
  EmotionBlend,
  PersonalityTraits,
  ExpressionParameters,
} from '@/agent/types';
import { createDefaultVisualConfig } from '@/agent/renderer/ProceduralFace';
import {
  emotionToExpression,
  emotionToBlend,
  createNeutralBlend,
} from '@/agent/expression/ExpressionController';
import type { EmotionType } from '@/agent/types';

const PRESET_EMOTIONS: { label: string; emotion: EmotionType }[] = [
  { label: 'Neutral', emotion: 'neutral' },
  { label: 'Happy', emotion: 'happy' },
  { label: 'Excited', emotion: 'excited' },
  { label: 'Angry', emotion: 'angry' },
  { label: 'Sad', emotion: 'sad' },
  { label: 'Surprised', emotion: 'surprised' },
  { label: 'Curious', emotion: 'curious' },
  { label: 'Skeptical', emotion: 'skeptical' },
  { label: 'Confident', emotion: 'confident' },
  { label: 'Thinking', emotion: 'thinking' },
];

type Mode = 'quick' | 'creator';

export default function AgentTestPage() {
  const [mode, setMode] = useState<Mode>('quick');
  const [config] = useState<AgentVisualConfig>(createDefaultVisualConfig());
  const [blend, setBlend] = useState<EmotionBlend>(createNeutralBlend());
  const [traits] = useState<PersonalityTraits>({
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.7,
    agreeableness: 0.5,
    neuroticism: 0.3,
  });
  const [debug, setDebug] = useState(false);

  const expression: ExpressionParameters = emotionToExpression(blend, traits);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
          2D Agent Test
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Continuous Parametric Animation System
        </p>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('quick')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'quick'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Quick Test
          </button>
          <button
            onClick={() => setMode('creator')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'creator'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Full Creator
          </button>
          <label className="flex items-center gap-2 ml-auto text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={debug}
              onChange={e => setDebug(e.target.checked)}
              className="accent-blue-500"
            />
            Debug overlay
          </label>
        </div>

        {mode === 'quick' ? (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Canvas */}
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <AgentCanvas
                  config={config}
                  expression={expression}
                  width={280}
                  height={400}
                  debug={debug}
                />
              </div>

              {/* Direction toggle */}
              <div className="flex gap-2">
                <AgentCanvas config={config} expression={expression} width={100} height={140} direction="left" />
                <AgentCanvas config={config} expression={expression} width={100} height={140} direction="right" />
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-6">
              {/* Preset Emotions */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Emotion Presets (discrete → blend)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PRESET_EMOTIONS.map(({ label, emotion }) => (
                    <button
                      key={emotion}
                      onClick={() => setBlend(emotionToBlend(emotion))}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blend Sliders */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  EmotionBlend (Plutchik 8)
                </h3>
                <div className="space-y-2">
                  {(Object.keys(blend) as (keyof EmotionBlend)[]).map(key => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs w-24 text-gray-500">{key}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={blend[key]}
                        onChange={e => setBlend(prev => ({
                          ...prev,
                          [key]: parseFloat(e.target.value),
                        }))}
                        className="flex-1 h-1.5 accent-blue-500"
                      />
                      <span className="text-xs w-8 text-right font-mono text-gray-400">
                        {blend[key].toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expression Output */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Expression Parameters (computed)
                </h3>
                <pre className="text-[10px] bg-gray-100 dark:bg-gray-800 rounded p-3 overflow-auto max-h-48 font-mono">
                  {JSON.stringify(expression, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <AgentCreator
              onSave={(savedConfig, savedTraits) => {
                console.log('Saved:', { config: savedConfig, traits: savedTraits });
                alert('Config saved to console. Check DevTools.');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
