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
    const author = metadata.author || 'Unknown';
    const genre = metadata.genre || 'general';
    const category = metadata.category || genre; // 상위 카테고리 (fantasy, martial-arts, romance 등)
    const source = metadata.source || 'upload';
    const agentId = this.agentId;

    // Deterministic ID for dedup — same book won't create duplicate nodes
    const domainId = `source-${this._hash(title + '|' + author)}`;

    // Common metadata for all nodes from this ingestion
    const nodeMeta = { genre, category, source, sourceTitle: title, sourceAuthor: author };

    // 1. Split into chapters — LLM tree first, regex fallback
    const chapters = (await this._splitChaptersWithLLM(text)) || this._splitChapters(text);
    console.log(`[TextIngestion] "${title}": ${chapters.length} chapters, ${text.length} chars`);

    let nodesCreated = 0;

    // 2. Create Domain node for the source text (deterministic ID = dedup)
    if (agentId) {
      try {
        await BrainClient.addToGraph(agentId, {
          id: domainId,
          type: 'Domain',
          title: `Reference: ${title}`,
          description: `${author} | ${genre} | ${chapters.length} chapters | Source: ${source}`,
          metadata: nodeMeta,
        }, null, { skipSimilarSearch: true });
        nodesCreated++;
      } catch {}
    }

    // 3. Process chapters — parallel with concurrency limit
    const CONCURRENCY = 3;
    const chapterResults = [];

    for (let start = 0; start < chapters.length; start += CONCURRENCY) {
      const batch = chapters.slice(start, start + CONCURRENCY);
      const promises = batch.map((chapter, batchIdx) => {
        const i = start + batchIdx;
        return this._processChapter(chapter, i, { agentId, title, genre, domainId, nodeMeta });
      });
      const results = await Promise.allSettled(promises);
      for (const r of results) {
        if (r.status === 'fulfilled') nodesCreated += r.value;
      }
    }

    return { success: true, nodesCreated, chaptersFound: chapters.length, title };
  }

  /**
   * Process a single chapter — create all node types.
   * @returns {number} nodesCreated
   */
  async _processChapter(chapter, index, ctx) {
    const { agentId, title, genre, domainId, nodeMeta } = ctx;
    if (chapter.content.length < 50) return 0;
    let created = 0;
    const opts = { skipSimilarSearch: true };

    if (agentId) {
      // 3a. Chapter/Section node — with hierarchy info from PageIndex tree
      const sectionLevel = chapter.level || 1;
      const nodeRole = sectionLevel === 1 ? 'section' : 'subsection';
      const sectionId = `${domainId}-ch${index}`;
      try {
        await BrainClient.addToGraph(agentId, {
          id: sectionId,
          type: 'Idea',
          title: `[${genre}] ${chapter.title || `${title} Ch.${index + 1}`}`,
          description: chapter.content.slice(0, 500),
          metadata: { ...nodeMeta, chapterIndex: index, nodeRole, level: sectionLevel, hasChildren: !!chapter.hasChildren },
          parentId: domainId,
        }, null, opts);
        created++;

        // CONTAINS edge from domain → section (structural hierarchy)
        if (sectionLevel === 1) {
          try {
            await BrainClient.addEdge(domainId, sectionId, 'CONTAINS');
          } catch {}
        }
      } catch {}

      // 3b. Best paragraphs node — Level 2: 원문 문단 저장 (스타일 학습)
      const bestParagraphs = this._extractBestParagraphs(chapter.content, 3);
      if (bestParagraphs.length > 0) {
        try {
          await BrainClient.addToGraph(agentId, {
            type: 'Idea',
            title: `[${genre}/style] ${title} Ch.${index + 1} 명문장`,
            description: bestParagraphs.join('\n---\n'),
            metadata: { ...nodeMeta, chapterIndex: index, nodeRole: 'style' },
            parentId: domainId,
          }, null, opts);
          created++;
        } catch {}
      }

      // 3c. Dialogue samples node (대화체 학습)
      const dialogues = this._extractDialogues(chapter.content, 5);
      if (dialogues.length >= 2) {
        try {
          await BrainClient.addToGraph(agentId, {
            type: 'Idea',
            title: `[${genre}/dialogue] ${title} Ch.${index + 1} 대화`,
            description: dialogues.join('\n'),
            metadata: { ...nodeMeta, chapterIndex: index, nodeRole: 'dialogue' },
            parentId: domainId,
          }, null, opts);
          created++;
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
              metadata: { ...nodeMeta, chapterIndex: index, nodeRole: 'concept' },
              parentId: domainId,
            }, null, opts);
            created++;
          }
        }
      } catch (err) {
        console.warn(`[TextIngestion] Concept extraction failed ch${index + 1}:`, err.message);
      }
    }

    // 3e. Style analysis via LLM (문체 학습) — Level 2 핵심
    if (this.llmCall && chapter.content.length > 300) {
      try {
        const style = await this._analyzeStyle(chapter.content, genre);
        if (style && agentId) {
          await BrainClient.addToGraph(agentId, {
            type: 'Idea',
            title: `[${genre}/style-analysis] ${title} Ch.${index + 1} 문체`,
            description: style,
            metadata: { ...nodeMeta, chapterIndex: index, nodeRole: 'style-analysis' },
            parentId: domainId,
          }, null, opts);
          created++;
        }
      } catch {}
    }

    return created;
  }

  /** Simple hash for deterministic IDs */
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  /**
   * Split text into chapters using LLM tree builder (PageIndex pattern).
   * Falls back to regex if mol-engine unavailable.
   * @origin clone/PageIndex pageindex/page_index.py
   */
  async _splitChaptersWithLLM(text) {
    try {
      const MOL_ENGINE_URL = process.env.MOL_ENGINE_URL || 'http://localhost:5000';
      const res = await fetch(`${MOL_ENGINE_URL}/v1/pageindex/build-tree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 200000), max_preview: 5000 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;

      const { tree } = await res.json();
      if (!tree || tree.length === 0) return null;

      // Convert tree to chapter format with hierarchy info
      const chapters = [];
      const flatten = (nodes, level = 1) => {
        for (const node of nodes) {
          const content = text.slice(node.start_offset || 0, node.end_offset || text.length);
          if (content.length > 30) {
            chapters.push({
              title: node.title,
              content,
              level,
              start_offset: node.start_offset,
              end_offset: node.end_offset,
              hasChildren: !!(node.nodes && node.nodes.length > 0),
            });
          }
          if (node.nodes) flatten(node.nodes, level + 1);
        }
      };
      flatten(tree);
      console.log(`[TextIngestion] LLM tree: ${chapters.length} sections (${tree.length} top-level)`);
      return chapters.length >= 2 ? chapters : null;
    } catch (err) {
      console.warn('[TextIngestion] LLM tree builder unavailable:', err.message);
      return null;
    }
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
