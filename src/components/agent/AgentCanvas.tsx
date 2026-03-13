'use client';

/**
 * AgentCanvas — React Canvas component
 *
 * Receives AgentVisualState and renders agent character via Canvas 2D
 * Interpolates ExpressionParameters using framer-motion useSpring
 * Runs idle animation at 60fps via requestAnimationFrame loop
 */

import { useRef, useEffect, useCallback } from 'react';
import { useSpring, useMotionValue } from 'framer-motion';
import type {
  AgentVisualConfig,
  ExpressionParameters,
} from '@/agent/types';
import { renderAgent } from '@/agent/renderer/ProceduralFace';
import {
  addIdleVariation,
  createNeutralExpression,
} from '@/agent/expression/ExpressionController';

interface AgentCanvasProps {
  config: AgentVisualConfig;
  expression?: ExpressionParameters;
  width?: number;
  height?: number;
  scale?: number;
  direction?: 'left' | 'right';
  debug?: boolean;
  className?: string;
}

// All keys of ExpressionParameters
const EXPR_KEYS: (keyof ExpressionParameters)[] = [
  'eyeOpenness', 'pupilDilation', 'browRaise', 'browFurrow',
  'mouthCurve', 'mouthOpen', 'cheekPuff',
  'headTilt', 'headNod', 'bodyLean', 'shoulderRaise', 'gestureIntensity',
  'blinkRate', 'breathRate',
];

const SPRING_CONFIG = { damping: 20, stiffness: 100, mass: 0.5 };

export default function AgentCanvas({
  config,
  expression,
  width = 200,
  height = 280,
  scale = 1,
  direction = 'right',
  debug = false,
  className,
}: AgentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const targetExpr = expression || createNeutralExpression();

  // framer-motion springs for smooth interpolation
  const springs: Record<string, ReturnType<typeof useSpring>> = {};
  for (const key of EXPR_KEYS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const mv = useMotionValue(targetExpr[key]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    springs[key] = useSpring(mv, SPRING_CONFIG);
  }

  // Update spring targets when expression changes
  useEffect(() => {
    for (const key of EXPR_KEYS) {
      (springs[key] as ReturnType<typeof useMotionValue>).set(targetExpr[key]);
    }
  }, [targetExpr]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read current spring values
    const currentExpr = {} as Record<string, number>;
    for (const key of EXPR_KEYS) {
      currentExpr[key] = springs[key].get();
    }

    // Add idle animation
    const elapsed = Date.now() - startTimeRef.current;
    const animatedExpr = addIdleVariation(currentExpr as unknown as ExpressionParameters, elapsed);

    // Render
    renderAgent(ctx, config, animatedExpr, {
      width,
      height,
      scale,
      direction,
      debug,
    });

    animFrameRef.current = requestAnimationFrame(render);
  }, [config, width, height, scale, direction, debug, springs]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: 'auto' }}
    />
  );
}
