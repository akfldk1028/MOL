'use client';

import { useMemo } from 'react';
import { PanelOverlay } from './PanelOverlay';

/**
 * Webtoon vertical scroll viewer
 * - Parses markdown images + text into panels
 * - Applies scroll rhythm: image→image tight, text panels get breathing room
 * - First/last images get emphasis (full width), mid panels get standard width
 * - Dramatic pause (large gap) before text that starts with special markers
 * - Speech bubble overlay on panels with dialogue
 */

interface PanelElement {
  type: 'image' | 'text';
  value: string;
  /** Panel position hint for width variation */
  emphasis?: 'full' | 'standard' | 'narrow';
  /** Dialogue to overlay as speech bubble (for image panels) */
  dialogue?: string;
}

/**
 * Parse [PANEL] blocks into text elements (for episodes where image generation failed)
 * Format: [PANEL]\nIMAGE: ...\nTEXT: ...\n\n[PANEL]\n...
 */
function parsePanelBlocks(content: string): PanelElement[] {
  const elements: PanelElement[] = [];
  const panelRegex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
  let match;

  while ((match = panelRegex.exec(content)) !== null) {
    const block = match[1].trim();
    const textMatch = block.match(/^TEXT:\s*(.+)/im);
    const text = textMatch ? textMatch[1].trim() : '';
    if (text) elements.push({ type: 'text', value: text });
  }

  // Fallback: line-by-line parsing if regex found nothing
  if (elements.length === 0) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TEXT:')) {
        const text = trimmed.slice(5).trim();
        if (text) elements.push({ type: 'text', value: text });
      }
    }
  }

  return elements;
}

/**
 * Extract dialogue mapping from [PANEL] blocks for speech bubble overlay.
 * Returns Map<imageIndex, dialogueText> based on panel order.
 */
function extractDialogueMap(content: string): Map<number, string> {
  const dialogueMap = new Map<number, string>();
  const panelRegex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
  let match;
  let panelIdx = 0;

  while ((match = panelRegex.exec(content)) !== null) {
    const block = match[1].trim();
    const textMatch = block.match(/^TEXT:\s*(.+)/im);
    const imageMatch = block.match(/^IMAGE:\s*.+/im);

    if (imageMatch && textMatch) {
      const text = textMatch[1].trim();
      if (text) dialogueMap.set(panelIdx, text);
    }
    if (imageMatch) panelIdx++;
  }

  return dialogueMap;
}

function parseContent(content: string, imageUrls: string[]): PanelElement[] {
  // Check if content uses [PANEL] format (image gen may have failed)
  const hasPanelFormat = content.includes('[PANEL]') && content.includes('IMAGE:') && content.includes('TEXT:');

  if (hasPanelFormat && imageUrls.length === 0) {
    // Extract just the TEXT parts from [PANEL] blocks
    return parsePanelBlocks(content);
  }

  // Extract dialogue map for speech bubble overlay
  const dialogueMap = hasPanelFormat ? extractDialogueMap(content) : new Map<number, string>();

  const lines = content.split('\n');
  const elements: PanelElement[] = [];
  let imageIndex = 0;

  for (const line of lines) {
    // Match markdown images — handle URLs with special chars including )
    const imgMatch = line.match(/^!\[.*?\]\(([^)]+)\)$/);
    if (imgMatch) {
      const dialogue = dialogueMap.get(imageIndex);
      elements.push({ type: 'image', value: imgMatch[1], dialogue: dialogue || undefined });
      imageIndex++;
    } else if (line.trim()) {
      // Skip raw [PANEL], IMAGE:, [/PANEL] lines if mixed with markdown images
      const stripped = line.trim();
      if (/^\[?\/?PANEL\]?$/.test(stripped) || /^IMAGE:/.test(stripped) || /^TEXT:/.test(stripped)) continue;
      elements.push({ type: 'text', value: stripped });
    }
  }

  // If no images in content, interleave image_urls with text
  if (elements.every(e => e.type === 'text') && imageUrls.length > 0) {
    const textElements = elements.filter(e => e.type === 'text');
    const merged: PanelElement[] = [];
    for (let i = 0; i < Math.max(imageUrls.length, textElements.length); i++) {
      if (i < imageUrls.length) {
        const dialogue = dialogueMap.get(i);
        merged.push({ type: 'image', value: imageUrls[i], dialogue: dialogue || undefined });
      }
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

  // Fallback: text-only content (panel text extracted or novel-style)
  const isPanelFormat = content.includes('[PANEL]') && content.includes('IMAGE:');
  if (!hasImages) {
    const textParts = elements.length > 0
      ? elements.filter(e => e.type === 'text').map(e => e.value)
      : content.split('\n\n').map(p => p.trim()).filter(Boolean);

    return (
      <div className="bg-[#0a0a0a] rounded-lg overflow-hidden">
        {isPanelFormat && (
          <div className="px-6 py-3 bg-amber-900/30 text-amber-200 text-xs text-center">
            Image generation is pending. Text-only preview.
          </div>
        )}
        {textParts.map((text, i) => {
          const isDramatic = text.startsWith('(') || text.startsWith('…') || text.startsWith('...');
          return (
            <div key={`txt-${i}`} className={`px-6 text-center bg-[#111] ${isDramatic ? 'py-8' : 'py-5'} ${i > 0 ? 'mt-1' : ''}`}>
              <p className={`text-white leading-relaxed max-w-md mx-auto ${isDramatic ? 'text-base italic text-gray-300' : 'text-sm'}`}>
                {text}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] rounded-lg overflow-hidden">
      {elements.map((el, i) => {
        const gap = getGapClass(elements[i - 1], el);

        if (el.type === 'image') {
          const widthClass = getImageWidthClass(el.emphasis);

          // Use PanelOverlay if panel has dialogue for speech bubble
          if (el.dialogue) {
            return (
              <div key={`img-${i}`} className={`${gap} bg-black`}>
                <PanelOverlay
                  imageUrl={el.value}
                  altText={`Panel ${i + 1}`}
                  widthClass={widthClass}
                  dialogues={[{ text: el.dialogue }]}
                  loading="lazy"
                />
              </div>
            );
          }

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
