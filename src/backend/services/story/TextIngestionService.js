/**
 * TextIngestionService — Import reference texts (novels, stories) into CGB knowledge graph
 *
 * Paper: KG-Guided Storytelling (2025) — reference material improves action/fantasy quality
 * Paper: Long Story KG (2025) — KG structure for character relations + event chains
 *
 * Flow: txt file → chapter splitting → LLM concept extraction → CGB graph nodes
 *
 * Supported sources:
 * - User-uploaded txt files
 * - Project Gutenberg API (public domain)
 * - archive.org REST API (public domain)
 */

const BrainClient = require('../BrainClient');
const { queryOne } = require('../../config/database');

class TextIngestionService {
  /**
   * @param {object} options
   * @param {Function} options.llmCall - async (system, user, opts) => string — for concept extraction
   * @param {string} [options.agentId] - Agent ID for CGB attribution
   */
  constructor(options = {}) {
    this.llmCall = options.llmCall || null;
    this.agentId = options.agentId || null;
  }

  /**
   * Ingest a text file into CGB graph.
   * @param {string} text - Full text content
   * @param {object} metadata - { title, author, genre, language, source }
   * @returns {{ success, nodesCreated, chaptersFound }}
   */
  async ingest(text, metadata) {
    if (!text || text.length < 100) return { success: false, error: 'Text too short' };

    const title = metadata.title || 'Unknown';
    const genre = metadata.genre || 'general';
    const agentId = this.agentId;

    // 1. Split into chapters
    const chapters = this._splitChapters(text);
    console.log(`[TextIngestion] "${title}": ${chapters.length} chapters, ${text.length} chars`);

    let nodesCreated = 0;

    // 2. Create Domain node for the source text
    if (agentId) {
      try {
        await BrainClient.addToGraph(agentId, {
          type: 'Domain',
          title: `Reference: ${title}`,
          description: `${metadata.author || 'Unknown'} | ${genre} | ${chapters.length} chapters | Source: ${metadata.source || 'upload'}`,
        });
        nodesCreated++;
      } catch {}
    }

    // 3. Process each chapter → multiple node types for deep learning
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (chapter.content.length < 50) continue;

      if (agentId) {
        // 3a. Chapter summary node (구조 학습)
        try {
          await BrainClient.addToGraph(agentId, {
            type: 'Idea',
            title: `[${genre}] ${chapter.title || `${title} Ch.${i + 1}`}`,
            description: chapter.content.slice(0, 500),
          });
          nodesCreated++;
        } catch {}

        // 3b. Best paragraphs node — Level 2: 원문 문단 저장 (스타일 학습)
        const bestParagraphs = this._extractBestParagraphs(chapter.content, 3);
        if (bestParagraphs.length > 0) {
          try {
            await BrainClient.addToGraph(agentId, {
              type: 'Idea',
              title: `[${genre}/style] ${title} Ch.${i + 1} 명문장`,
              description: bestParagraphs.join('\n---\n'),
            });
            nodesCreated++;
          } catch {}
        }

        // 3c. Dialogue samples node (대화체 학습)
        const dialogues = this._extractDialogues(chapter.content, 5);
        if (dialogues.length >= 2) {
          try {
            await BrainClient.addToGraph(agentId, {
              type: 'Idea',
              title: `[${genre}/dialogue] ${title} Ch.${i + 1} 대화`,
              description: dialogues.join('\n'),
            });
            nodesCreated++;
          } catch {}
        }
      }

      // 3d. Extract narrative concepts via LLM (구조 학습)
      if (this.llmCall && chapter.content.length > 200) {
        try {
          const concepts = await this._extractConcepts(chapter.content, genre);
          for (const concept of concepts) {
            if (agentId) {
              await BrainClient.addToGraph(agentId, {
                type: 'Idea',
                title: `[${genre}] ${concept.name}`,
                description: concept.description,
              });
              nodesCreated++;
            }
          }
        } catch (err) {
          console.warn(`[TextIngestion] Concept extraction failed ch${i + 1}:`, err.message);
        }
      }

      // 3e. Style analysis via LLM (문체 학습) — Level 2 핵심
      if (this.llmCall && chapter.content.length > 300) {
        try {
          const style = await this._analyzeStyle(chapter.content, genre);
          if (style && agentId) {
            await BrainClient.addToGraph(agentId, {
              type: 'Idea',
              title: `[${genre}/style-analysis] ${title} Ch.${i + 1} 문체`,
              description: style,
            });
            nodesCreated++;
          }
        } catch {}
      }
    }

    return { success: true, nodesCreated, chaptersFound: chapters.length, title };
  }

  /**
   * Split text into chapters using common patterns.
   */
  _splitChapters(text) {
    // Try various chapter delimiter patterns
    const patterns = [
      /(?:^|\n)(Chapter\s+\d+[^\n]*)/gi,           // English
      /(?:^|\n)(제\s*\d+\s*장[^\n]*)/gi,            // Korean 제N장
      /(?:^|\n)(#{1,3}\s+.+)/g,                      // Markdown headers
      /(?:^|\n)(\d+\.\s+[^\n]+)/g,                   // Numbered sections
      /\n{3,}/g,                                       // Triple newlines
    ];

    for (const pattern of patterns) {
      const splits = text.split(pattern).filter(s => s.trim().length > 0);
      if (splits.length >= 3) {
        const chapters = [];
        for (let i = 0; i < splits.length; i += 2) {
          const title = splits[i]?.trim();
          const content = splits[i + 1]?.trim() || splits[i]?.trim() || '';
          if (content.length > 30) {
            chapters.push({ title: title?.length < 100 ? title : `Chapter ${chapters.length + 1}`, content });
          }
        }
        if (chapters.length >= 2) return chapters;
      }
    }

    // Fallback: split by word count (~3000 words per chunk)
    const words = text.split(/\s+/);
    const chunkSize = 3000;
    const chapters = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chapters.push({
        title: `Section ${chapters.length + 1}`,
        content: chunk,
      });
    }
    return chapters;
  }

  // ─── Level 2: Style Learning ───

  /**
   * Extract best paragraphs (longest, most descriptive) for style reference.
   */
  _extractBestParagraphs(text, count = 3) {
    const paragraphs = text.split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 80 && !p.startsWith('#') && !p.startsWith('제'));

    // Score: length + sensory words + dialogue presence
    const sensoryWords = /빛|소리|냄새|바람|차가|따뜻|부드|거친|향|맛|눈물|심장|숨|떨|색|그림자|silence|warm|cold|light|dark|whisper/;
    const scored = paragraphs.map(p => ({
      text: p,
      score: Math.min(p.length, 500) + (sensoryWords.test(p) ? 100 : 0) + (p.includes('"') || p.includes('\"') ? 50 : 0),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.text.slice(0, 400));
  }

  /**
   * Extract dialogue lines for dialogue style learning.
   */
  _extractDialogues(text, count = 5) {
    const patterns = [
      /["\u201C]([^"\u201D]{5,100})["\u201D]/g,      // "대화"
      /「([^」]{5,100})」/g,                             // 「대화」
    ];
    const dialogues = [];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(text)) !== null) {
        dialogues.push(m[0]);
      }
    }
    return dialogues.slice(0, count);
  }

  /**
   * Analyze writing style via LLM — Level 2 core.
   */
  async _analyzeStyle(text, genre) {
    if (!this.llmCall) return null;
    const system = 'You are a literary style analyst. Analyze the writing style in 3-4 bullet points. Focus on: sentence rhythm, description technique, dialogue style, emotional expression method. Korean response. Be specific with examples from the text.';
    const user = `Analyze the writing style of this ${genre} text:\n\n${text.slice(0, 2000)}`;
    try {
      return await this.llmCall(system, user, { maxOutputTokens: 512 });
    } catch { return null; }
  }

  /**
   * Extract key concepts from text via LLM.
   */
  async _extractConcepts(text, genre) {
    if (!this.llmCall) return [];

    const system = 'You extract key narrative concepts. Return ONLY a JSON array of 2-4 concepts. Each: {"name": "short name", "description": "1-2 sentence description"}. No markdown.';
    const user = `Extract key narrative concepts from this ${genre} text:\n\n${text.slice(0, 2000)}`;

    try {
      const raw = await this.llmCall(system, user, { maxOutputTokens: 1024 });
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start !== -1 && end > start) {
        return JSON.parse(raw.slice(start, end + 1));
      }
    } catch {}
    return [];
  }

  /**
   * Fetch public domain text from Project Gutenberg.
   * @param {number} bookId - Gutenberg book ID
   * @returns {{ text, metadata }}
   */
  static async fetchGutenberg(bookId) {
    try {
      const url = `https://www.gutenberg.org/files/${bookId}/${bookId}-0.txt`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        // Try alternate URL format
        const altUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
        const res2 = await fetch(altUrl, { signal: AbortSignal.timeout(30000) });
        if (!res2.ok) return null;
        return { text: await res2.text(), metadata: { source: 'gutenberg', bookId } };
      }
      return { text: await res.text(), metadata: { source: 'gutenberg', bookId } };
    } catch {
      return null;
    }
  }

  /**
   * Search archive.org for public domain texts.
   * @param {string} query
   * @param {number} [limit=5]
   * @returns {Array<{ identifier, title, creator, year }>}
   */
  static async searchArchive(query, limit = 5) {
    try {
      const params = new URLSearchParams({
        q: `${query} mediatype:texts`,
        fl: 'identifier,title,creator,year',
        rows: String(limit),
        output: 'json',
      });
      const url = `https://archive.org/advancedsearch.php?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];
      const data = await res.json();
      return data.response?.docs || [];
    } catch {
      return [];
    }
  }
}

module.exports = { TextIngestionService };
