'use client';

/**
 * SpeechBubble — Overlay speech bubble on webtoon panels
 *
 * Inspired by TaleDiffusion's text_bubble.py, adapted for CSS overlay.
 * Positioned absolutely within a panel container.
 */

interface SpeechBubbleProps {
  text: string;
  /** Position within the panel (0-100 percentage) */
  x?: number;
  y?: number;
  /** Bubble style variant */
  variant?: 'speech' | 'thought' | 'narration' | 'shout';
  /** Max width in pixels */
  maxWidth?: number;
}

const VARIANT_STYLES: Record<string, string> = {
  speech:
    'bg-white text-black border-2 border-black rounded-2xl px-4 py-2',
  thought:
    'bg-white/90 text-black border-2 border-dashed border-gray-400 rounded-2xl px-4 py-2',
  narration:
    'bg-black/70 text-white border border-gray-600 rounded-md px-3 py-2',
  shout:
    'bg-white text-black border-3 border-black rounded-2xl px-4 py-2 font-bold',
};

export function SpeechBubble({
  text,
  x = 50,
  y = 15,
  variant = 'speech',
  maxWidth = 200,
}: SpeechBubbleProps) {
  if (!text) return null;

  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.speech;

  // Detect variant from text content
  const effectiveVariant = detectVariant(text, variant);
  const effectiveStyle = VARIANT_STYLES[effectiveVariant] || style;

  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{
        left: `${clamp(x, 5, 85)}%`,
        top: `${clamp(y, 2, 85)}%`,
        transform: 'translate(-50%, 0)',
        maxWidth: `${maxWidth}px`,
      }}
    >
      <div className={`${effectiveStyle} text-center text-xs leading-snug shadow-md`}>
        <p className="whitespace-pre-wrap">{cleanText(text)}</p>
      </div>
      {/* Speech bubble tail (for speech/shout variants) */}
      {(effectiveVariant === 'speech' || effectiveVariant === 'shout') && (
        <div
          className="mx-auto w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '8px solid black',
          }}
        />
      )}
    </div>
  );
}

/** Detect bubble variant from text patterns */
function detectVariant(text: string, fallback: string): string {
  const trimmed = text.trim();
  // Parenthetical = thought
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return 'thought';
  // Brackets or italic markers = narration
  if (trimmed.startsWith('[') || trimmed.startsWith('*')) return 'narration';
  // ALL CAPS (Latin text only) or exclamation-heavy = shout
  const hasLatin = /[a-zA-Z]/.test(trimmed);
  if (hasLatin && trimmed === trimmed.toUpperCase() && trimmed.length > 3) return 'shout';
  if ((trimmed.match(/!/g) || []).length >= 2) return 'shout';
  return fallback;
}

function cleanText(text: string): string {
  return text
    .replace(/^\(|\)$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^\*|\*$/g, '')
    .trim();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
