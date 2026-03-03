'use client';

/**
 * AgentCreator — 슬라이더 기반 캐릭터 생성기
 *
 * FaceParameters + 색상 + PersonalityTraits를 슬라이더로 조절
 * 실시간 미리보기 (AgentCanvas)
 * JSON으로 저장/내보내기
 */

import { useState, useCallback } from 'react';
import AgentCanvas from './AgentCanvas';
import type {
  AgentVisualConfig,
  FaceParameters,
  PersonalityTraits,
  EmotionBlend,
  ExpressionParameters,
} from '@/agent/types';
import { createDefaultVisualConfig } from '@/agent/renderer/ProceduralFace';
import {
  emotionToExpression,
  createNeutralBlend,
} from '@/agent/expression/ExpressionController';

interface AgentCreatorProps {
  onSave?: (config: AgentVisualConfig, traits: PersonalityTraits) => void;
  initialConfig?: AgentVisualConfig;
  initialTraits?: PersonalityTraits;
}

const FACE_PARAM_LABELS: Record<keyof FaceParameters, string> = {
  headShape: '머리 형태 (둥근 ↔ 각진)',
  eyeSize: '눈 크기',
  eyeSpacing: '눈 간격',
  noseSize: '코 크기',
  mouthWidth: '입 너비',
  browThickness: '눈썹 두께',
  chinLength: '턱 길이',
};

const TRAIT_LABELS: Record<keyof PersonalityTraits, string> = {
  openness: '개방성',
  conscientiousness: '성실성',
  extraversion: '외향성',
  agreeableness: '친화성',
  neuroticism: '신경성',
};

const EMOTION_LABELS: Record<keyof EmotionBlend, string> = {
  joy: '기쁨',
  anger: '분노',
  sadness: '슬픔',
  surprise: '놀람',
  disgust: '혐오',
  fear: '공포',
  trust: '신뢰',
  anticipation: '기대',
};

const COLOR_PRESETS = {
  skin: ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#5C3A1E'],
  hair: ['#2C1810', '#4A3728', '#8B6914', '#C4A35A', '#E8D5B7', '#B22222', '#4169E1', '#9370DB'],
  eye: ['#2E1A0E', '#634E34', '#4A7B3F', '#3B7DD8', '#808080'],
  outfit: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560', '#f5f5f5'],
};

type Tab = 'face' | 'color' | 'personality' | 'emotion';

export default function AgentCreator({
  onSave,
  initialConfig,
  initialTraits,
}: AgentCreatorProps) {
  const [config, setConfig] = useState<AgentVisualConfig>(
    initialConfig || createDefaultVisualConfig()
  );
  const [traits, setTraits] = useState<PersonalityTraits>(
    initialTraits || {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    }
  );
  const [emotionTest, setEmotionTest] = useState<EmotionBlend>(createNeutralBlend());
  const [activeTab, setActiveTab] = useState<Tab>('face');

  const expression: ExpressionParameters = emotionToExpression(emotionTest, traits);

  const updateFaceParam = useCallback((key: keyof FaceParameters, value: number) => {
    setConfig(prev => ({
      ...prev,
      faceParams: { ...prev.faceParams, [key]: value },
    }));
  }, []);

  const updateColor = useCallback((key: 'skinColor' | 'hairColor' | 'eyeColor' | 'outfitColor', value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateTrait = useCallback((key: keyof PersonalityTraits, value: number) => {
    setTraits(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateEmotion = useCallback((key: keyof EmotionBlend, value: number) => {
    setEmotionTest(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(config, traits);
  }, [config, traits, onSave]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <AgentCanvas
            config={config}
            expression={expression}
            width={240}
            height={340}
          />
        </div>
        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          저장
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 min-w-0">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
          {([
            ['face', '얼굴'],
            ['color', '색상'],
            ['personality', '성격'],
            ['emotion', '감정 테스트'],
          ] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {activeTab === 'face' &&
            (Object.keys(FACE_PARAM_LABELS) as (keyof FaceParameters)[]).map(key => (
              <SliderRow
                key={key}
                label={FACE_PARAM_LABELS[key]}
                value={config.faceParams[key]}
                onChange={v => updateFaceParam(key, v)}
              />
            ))
          }

          {activeTab === 'color' && (
            <>
              <ColorPicker label="피부색" colors={COLOR_PRESETS.skin} value={config.skinColor} onChange={v => updateColor('skinColor', v)} />
              <ColorPicker label="머리 색" colors={COLOR_PRESETS.hair} value={config.hairColor} onChange={v => updateColor('hairColor', v)} />
              <ColorPicker label="눈 색" colors={COLOR_PRESETS.eye} value={config.eyeColor} onChange={v => updateColor('eyeColor', v)} />
              <ColorPicker label="의상 색" colors={COLOR_PRESETS.outfit} value={config.outfitColor} onChange={v => updateColor('outfitColor', v)} />
            </>
          )}

          {activeTab === 'personality' &&
            (Object.keys(TRAIT_LABELS) as (keyof PersonalityTraits)[]).map(key => (
              <SliderRow
                key={key}
                label={TRAIT_LABELS[key]}
                value={traits[key]}
                onChange={v => updateTrait(key, v)}
              />
            ))
          }

          {activeTab === 'emotion' &&
            (Object.keys(EMOTION_LABELS) as (keyof EmotionBlend)[]).map(key => (
              <SliderRow
                key={key}
                label={EMOTION_LABELS[key]}
                value={emotionTest[key]}
                onChange={v => updateEmotion(key, v)}
              />
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-400 w-40 shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 accent-blue-500"
      />
      <span className="text-xs text-gray-500 w-10 text-right font-mono">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function ColorPicker({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex gap-2 flex-wrap">
        {colors.map(color => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              value === color ? 'border-blue-500 scale-110' : 'border-gray-300 dark:border-gray-600'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}
