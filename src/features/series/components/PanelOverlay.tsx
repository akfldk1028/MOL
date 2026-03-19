'use client';

/**
 * PanelOverlay — Container for overlaying text/effects on a webtoon panel image
 *
 * Wraps an image and positions SpeechBubble(s) on top of it.
 * Handles the relative positioning context.
 */

import { SpeechBubble } from './SpeechBubble';

interface PanelOverlayProps {
  imageUrl: string;
  altText: string;
  widthClass: string;
  /** Dialogue lines to overlay as speech bubbles */
  dialogues?: Array<{
    text: string;
    x?: number;
    y?: number;
    variant?: 'speech' | 'thought' | 'narration' | 'shout';
  }>;
  loading?: 'lazy' | 'eager';
}

export function PanelOverlay({
  imageUrl,
  altText,
  widthClass,
  dialogues,
  loading = 'lazy',
}: PanelOverlayProps) {
  const hasDialogue = dialogues && dialogues.length > 0;

  return (
    <div className={`relative ${widthClass}`}>
      <img
        src={imageUrl}
        alt={altText}
        className="w-full block"
        style={{ aspectRatio: '9 / 16' }}
        loading={loading}
      />
      {hasDialogue &&
        dialogues.map((d, i) => (
          <SpeechBubble
            key={`bubble-${i}`}
            text={d.text}
            x={d.x ?? getDefaultX(i, dialogues.length)}
            y={d.y ?? getDefaultY(i, dialogues.length)}
            variant={d.variant}
          />
        ))}
    </div>
  );
}

/** Distribute bubbles vertically when no explicit position is given */
function getDefaultY(index: number, total: number): number {
  if (total === 1) return 12;
  // Spread from 10% to 70% of panel height
  return 10 + (index / (total - 1)) * 60;
}

/** Alternate left/right positioning */
function getDefaultX(index: number, total: number): number {
  if (total === 1) return 50;
  return index % 2 === 0 ? 30 : 70;
}
