/**
 * Procedural Face Renderer — Canvas 2D 프로시저럴 캐릭터 렌더링
 *
 * AgentVisualConfig (고정 외모) + ExpressionParameters (실시간 표정) →
 * Canvas 2D API로 캐릭터 얼굴/몸 그리기
 *
 * 모든 파라미터가 연속값이므로 무한한 표정/외모 조합 가능
 */

import type {
  AgentVisualConfig,
  ExpressionParameters,
  FaceParameters,
} from '../types';

export interface RenderOptions {
  width: number;
  height: number;
  scale?: number;      // 전체 스케일 (기본 1.0)
  direction?: 'left' | 'right';
  debug?: boolean;     // 파라미터 값 오버레이
}

const DEFAULT_OPTIONS: RenderOptions = {
  width: 200,
  height: 280,
  scale: 1,
  direction: 'right',
  debug: false,
};

/**
 * Canvas에 에이전트 캐릭터 렌더링
 */
export function renderAgent(
  ctx: CanvasRenderingContext2D,
  config: AgentVisualConfig,
  expression: ExpressionParameters,
  options: Partial<RenderOptions> = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { width, height, scale = 1, direction } = opts;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 중심 기준으로 스케일 + 방향
  const cx = width / 2;
  const cy = height * 0.4; // 머리 중심

  ctx.translate(cx, cy);
  ctx.scale(scale * (direction === 'left' ? -1 : 1), scale);

  // 몸 기울기 적용
  const leanAngle = expression.bodyLean * 0.15; // 최대 ±8.6도
  ctx.rotate(leanAngle);

  // 렌더링 순서: 뒤 → 앞
  drawBody(ctx, config, expression);
  drawNeck(ctx, config);
  drawHead(ctx, config, expression);
  drawEars(ctx, config.faceParams, config.skinColor);
  drawEyes(ctx, config, expression);
  drawEyebrows(ctx, config.faceParams, expression);
  drawNose(ctx, config.faceParams, config.skinColor);
  drawMouth(ctx, config.faceParams, expression);
  drawCheeks(ctx, expression, config.skinColor);

  ctx.restore();

  if (opts.debug) {
    drawDebugOverlay(ctx, expression, width);
  }
}

// ─── 개별 렌더링 함수 ───

function drawHead(
  ctx: CanvasRenderingContext2D,
  config: AgentVisualConfig,
  expr: ExpressionParameters
): void {
  const fp = config.faceParams;
  const tiltAngle = expr.headTilt * 0.2; // 최대 ±11도
  const nodOffset = expr.headNod * 5;    // 최대 ±5px

  ctx.save();
  ctx.rotate(tiltAngle);
  ctx.translate(0, nodOffset);

  // 머리 윤곽 — headShape: 0=둥근, 1=각진
  const headW = 55 + fp.chinLength * 5;
  const headH = 65 + fp.chinLength * 8;
  const roundness = 1 - fp.headShape * 0.6; // 0.4 ~ 1.0

  ctx.fillStyle = config.skinColor;
  ctx.beginPath();

  // 베지어 곡선으로 머리 형태
  const cpOffset = headW * roundness;
  ctx.moveTo(0, -headH / 2);
  // 오른쪽 상단
  ctx.bezierCurveTo(cpOffset, -headH / 2, headW, -headH * 0.2, headW, headH * 0.1);
  // 오른쪽 하단 (턱)
  ctx.bezierCurveTo(headW, headH * 0.4, headW * 0.5, headH / 2, 0, headH / 2);
  // 왼쪽 하단
  ctx.bezierCurveTo(-headW * 0.5, headH / 2, -headW, headH * 0.4, -headW, headH * 0.1);
  // 왼쪽 상단
  ctx.bezierCurveTo(-headW, -headH * 0.2, -cpOffset, -headH / 2, 0, -headH / 2);

  ctx.fill();

  // 머리카락
  drawHair(ctx, config, headW, headH);

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  config: AgentVisualConfig,
  headW: number,
  headH: number
): void {
  ctx.fillStyle = config.hairColor;
  ctx.beginPath();

  // 간단한 헤어 렌더링 — 머리 윗부분 커버
  const hairHeight = headH * 0.35;
  ctx.ellipse(0, -headH / 2 + hairHeight * 0.3, headW + 3, hairHeight, 0, Math.PI, 0);
  ctx.fill();

  // 옆머리
  ctx.beginPath();
  ctx.ellipse(-headW - 1, -headH * 0.1, 6, headH * 0.3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headW + 1, -headH * 0.1, 6, headH * 0.3, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  config: AgentVisualConfig,
  expr: ExpressionParameters
): void {
  const fp = config.faceParams;
  const spacing = 15 + fp.eyeSpacing * 15; // 15~30
  const eyeW = 8 + fp.eyeSize * 10;        // 8~18
  const eyeH = (5 + fp.eyeSize * 8) * expr.eyeOpenness; // 높이 = 열림 정도

  for (const side of [-1, 1]) {
    const ex = side * spacing;
    const ey = -5;

    ctx.save();
    ctx.translate(ex, ey);

    // 눈 흰자
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeW, Math.max(1, eyeH), 0, 0, Math.PI * 2);
    ctx.fill();

    // 눈 테두리
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 동공 (eyeOpenness > 0.1일 때만)
    if (expr.eyeOpenness > 0.1) {
      const pupilR = (2 + fp.eyeSize * 3) * (0.5 + expr.pupilDilation * 0.5);
      ctx.fillStyle = config.eyeColor;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(pupilR, eyeH * 0.8), 0, Math.PI * 2);
      ctx.fill();

      // 하이라이트
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(pupilR * 0.3, -pupilR * 0.3, pupilR * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawEyebrows(
  ctx: CanvasRenderingContext2D,
  fp: FaceParameters,
  expr: ExpressionParameters
): void {
  const spacing = 15 + fp.eyeSpacing * 15;
  const browW = 12 + fp.browThickness * 5;
  const thickness = 2 + fp.browThickness * 2;

  for (const side of [-1, 1]) {
    const bx = side * spacing;
    const by = -18;

    ctx.save();
    ctx.translate(bx, by);

    // browRaise: 위치 이동, browFurrow: 안쪽 끝 내림
    const raiseOffset = -expr.browRaise * 8;
    const furrowAngle = expr.browFurrow * 0.3 * side;

    ctx.rotate(furrowAngle);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-browW / 2, raiseOffset);
    // 약간 아치형
    ctx.quadraticCurveTo(0, raiseOffset - 3 + expr.browRaise * 2, browW / 2, raiseOffset);
    ctx.stroke();

    ctx.restore();
  }
}

function drawNose(
  ctx: CanvasRenderingContext2D,
  fp: FaceParameters,
  skinColor: string
): void {
  const noseH = 6 + fp.noseSize * 8;
  const noseW = 3 + fp.noseSize * 4;

  ctx.strokeStyle = darkenColor(skinColor, 0.15);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(noseW, 2 + noseH * 0.7, 0, 2 + noseH);
  ctx.stroke();
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  fp: FaceParameters,
  expr: ExpressionParameters
): void {
  const mouthW = 10 + fp.mouthWidth * 15; // 10~25
  const my = 20;

  ctx.save();
  ctx.translate(0, my);

  if (expr.mouthOpen > 0.1) {
    // 열린 입
    const openH = expr.mouthOpen * 12;
    ctx.fillStyle = '#2D1B1B';
    ctx.beginPath();
    ctx.ellipse(0, 0, mouthW * 0.6, openH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 입 곡선 (mouthCurve: -1=아래, 1=위=미소)
  const curve = expr.mouthCurve * 8;
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-mouthW / 2, 0);
  ctx.quadraticCurveTo(0, curve, mouthW / 2, 0);
  ctx.stroke();

  ctx.restore();
}

function drawCheeks(
  ctx: CanvasRenderingContext2D,
  expr: ExpressionParameters,
  skinColor: string
): void {
  if (expr.cheekPuff < 0.05) return;

  const puffR = 5 + expr.cheekPuff * 10;
  ctx.fillStyle = lightenColor(skinColor, 0.1 + expr.cheekPuff * 0.15);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 40, 10, puffR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  config: AgentVisualConfig,
  expr: ExpressionParameters
): void {
  const shoulderW = 45;
  const bodyH = 60;
  const shoulderOffset = -expr.shoulderRaise * 5;

  ctx.fillStyle = config.outfitColor;
  ctx.beginPath();

  // 어깨~몸통 (사다리꼴)
  ctx.moveTo(-shoulderW, 45 + shoulderOffset);
  ctx.lineTo(shoulderW, 45 + shoulderOffset);
  ctx.lineTo(shoulderW * 0.8, 45 + bodyH);
  ctx.lineTo(-shoulderW * 0.8, 45 + bodyH);
  ctx.closePath();
  ctx.fill();

  // 어깨 라운드
  ctx.beginPath();
  ctx.arc(-shoulderW, 50 + shoulderOffset, 8, 0, Math.PI * 2);
  ctx.arc(shoulderW, 50 + shoulderOffset, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawNeck(ctx: CanvasRenderingContext2D, config: AgentVisualConfig): void {
  ctx.fillStyle = config.skinColor;
  ctx.fillRect(-8, 30, 16, 18);
}

function drawEars(
  ctx: CanvasRenderingContext2D,
  fp: FaceParameters,
  skinColor: string
): void {
  const headW = 55 + fp.chinLength * 5;
  const earH = 10;

  ctx.fillStyle = skinColor;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * headW, -2, 5, earH, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Color Helpers ───

function darkenColor(hex: string, amount: number): string {
  return adjustColor(hex, -amount);
}

function lightenColor(hex: string, amount: number): string {
  return adjustColor(hex, amount);
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + Math.round(amount * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + Math.round(amount * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + Math.round(amount * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  expr: ExpressionParameters,
  width: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, width, 14 * 8);

  ctx.fillStyle = '#00FF00';
  ctx.font = '10px monospace';
  const entries = Object.entries(expr);
  entries.forEach(([key, val], i) => {
    ctx.fillText(`${key}: ${(val as number).toFixed(2)}`, 4, 12 + i * 14);
  });
  ctx.restore();
}

/** 기본 AgentVisualConfig 생성 */
export function createDefaultVisualConfig(): AgentVisualConfig {
  return {
    faceParams: {
      headShape: 0.3,
      eyeSize: 0.5,
      eyeSpacing: 0.5,
      noseSize: 0.4,
      mouthWidth: 0.5,
      browThickness: 0.5,
      chinLength: 0.4,
    },
    skinColor: '#F1C27D',
    hairColor: '#2C1810',
    eyeColor: '#2E1A0E',
    outfitColor: '#1a1a2e',
    outfitStyle: 'casual',
    accessoryIds: [],
  };
}
