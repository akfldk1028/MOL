'use client';

import { useMemo } from 'react';

/**
 * Webtoon vertical scroll viewer
 * - Parses markdown images + text into panels
 * - Applies scroll rhythm: image→image tight, text panels get breathing room
 * - First/last images get emphasis (full width), mid panels get standard width
 * - Dramatic pause (large gap) before text that starts with special markers
 */

interface PanelElement {
  type: 'image' | 'text';
  value: string;
  /** Panel position hint for width variation */
  emphasis?: 'full' | 'standard' | 'narrow';
}

function parseContent(content: string, imageUrls: string[]): PanelElement[] {
  const lines = content.split('\n');
  const elements: PanelElement[] = [];

  for (const line of lines) {
    // Match markdown images — handle URLs with special chars including )
    const imgMatch = line.match(/^!\[.*?\]\(([^)]+)\)$/);
    if (imgMatch) {
      elements.push({ type: 'image', value: imgMatch[1] });
    } else if (line.trim()) {
      elements.push({ type: 'text', value: line.trim() });
    }
  }

  // If no images in content, interleave image_urls with text
  if (elements.every(e => e.type === 'text') && imageUrls.length > 0) {
    const textElements = elements.filter(e => e.type === 'text');
    const merged: PanelElement[] = [];
    for (let i = 0; i < Math.max(imageUrls.length, textElements.length); i++) {
      if (i < imageUrls.length) merged.push({ type: 'image', value: imageUrls[i] });
      if (i < textElements.length) merged.push(textElements[i]);
    }
    return merged;
  }

  return elements;
}

function assignEmphasis(elements: PanelElement[]): PanelElement[] {
  const images = elements.filter(e => e.type === 'image');
  const totalImages = images.length;

  let imageIdx = 0;
  return elements.map((el, i) => {
    if (el.type !== 'image') return el;
    imageIdx++;
    // First and last image panels: full emphasis (climax moments)
    if (imageIdx === 1 || imageIdx === totalImages) {
      return { ...el, emphasis: 'full' };
    }
    // Narrow: image sandwiched between two text panels (dialogue exchange)
    const prev = elements[i - 1];
    const next = elements[i + 1];
    if (prev?.type === 'text' && next?.type === 'text') {
      return { ...el, emphasis: 'narrow' };
    }
    return { ...el, emphasis: 'standard' };
  });
}

/** Determine gap class between two consecutive elements */
function getGapClass(prev: PanelElement | undefined, curr: PanelElement): string {
  if (!prev) return '';
  // Image → Image: tight (continuous scroll feel)
  if (prev.type === 'image' && curr.type === 'image') return 'mt-0';
  // Image → Text: breathing room
  if (prev.type === 'image' && curr.type === 'text') return 'mt-4';
  // Text → Image: small gap
  if (prev.type === 'text' && curr.type === 'image') return 'mt-2';
  // Text → Text: standard gap
  return 'mt-3';
}

function getImageWidthClass(emphasis?: 'full' | 'standard' | 'narrow'): string {
  switch (emphasis) {
    case 'full': return 'w-full';            // 100% — climax/reveal panels
    case 'narrow': return 'w-[60%] mx-auto'; // 60% — quick exchange
    default: return 'w-[85%] mx-auto';       // 85% — standard narrative
  }
}

export function WebtoonViewer({ content, imageUrls }: { content: string; imageUrls: string[] }) {
  // Memoize parsing — content/imageUrls are static per episode
  const elements = useMemo(() => {
    const raw = parseContent(content, imageUrls);
    return assignEmphasis(raw);
  }, [content, imageUrls]);

  const hasImages = elements.some(e => e.type === 'image');

  // Fallback: plain text content (novel-style)
  if (!hasImages) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {content.split('\n\n').map((p, i) => (
          <p key={`p-${i}`}>{p}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] rounded-lg overflow-hidden">
      {elements.map((el, i) => {
        const gap = getGapClass(elements[i - 1], el);

        if (el.type === 'image') {
          const widthClass = getImageWidthClass(el.emphasis);
          return (
            <div key={`img-${i}`} className={`${gap} bg-black`}>
              <img
                src={el.value}
                alt={`Panel ${i + 1}`}
                className={`${widthClass} block`}
                style={{ aspectRatio: '9 / 16' }}
                loading="lazy"
              />
            </div>
          );
        }

        // Text panel — speech/narration bubble style
        const isDramatic = el.value.startsWith('(') || el.value.startsWith('…') || el.value.startsWith('...');
        return (
          <div
            key={`txt-${i}`}
            className={`${gap} px-6 text-center bg-[#111]
              ${isDramatic ? 'py-8' : 'py-4'}`}
          >
            <p className={`text-white leading-relaxed max-w-md mx-auto
              ${isDramatic ? 'text-base italic text-gray-300' : 'text-sm'}`}>
              {el.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
