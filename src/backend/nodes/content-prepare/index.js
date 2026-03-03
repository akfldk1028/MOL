/**
 * Node: content-prepare
 * Preprocesses creative content before agent critique.
 * Handles text stats, chunking, summarization, and image URL setup.
 */

const { queryOne } = require('../../config/database');

const CHUNK_SIZE = 8000; // ~8K characters per chunk
const MAX_FULL_TEXT = 8000;
const MAX_CHUNK_TEXT = 30000;

/**
 * Split text into chunks of roughly equal size
 */
function chunkText(text, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  // Split on paragraph boundaries when possible
  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Generate a brief summary of long text for context
 */
function generateExcerptSummary(text) {
  // Take first 2000 chars + last 1000 chars as excerpt
  const head = text.slice(0, 2000);
  const tail = text.slice(-1000);
  return `[Beginning]\n${head}\n\n[...middle content omitted for brevity...]\n\n[Ending]\n${tail}`;
}

module.exports = {
  type: 'content-prepare',
  name: 'Content Prepare',
  description: 'Preprocess creative content (chunking, stats, image URLs)',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   */
  async execute(ctx, config = {}) {
    const creation = ctx.creation;
    if (!creation) throw new Error('content-prepare requires ctx.creation');

    const text = creation.content || '';
    const creationType = creation.creation_type || 'novel';

    // Text statistics
    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Chunking strategy
    let contentText = text;
    let chunks = [];
    let summary = null;

    if (charCount <= MAX_FULL_TEXT) {
      // Short text: send full content
      contentText = text;
      chunks = [text];
    } else if (charCount <= MAX_CHUNK_TEXT) {
      // Medium text: chunk it
      chunks = chunkText(text);
      contentText = text;
    } else {
      // Long text: create summary excerpt + chunks
      chunks = chunkText(text);
      summary = generateExcerptSummary(text);
      contentText = summary;
    }

    // Image URLs (for webtoon)
    const imageUrls = creation.image_urls || [];

    // Set context for downstream nodes
    ctx.creativeContent = {
      title: creation.title,
      text: contentText,
      fullText: text,
      chunks,
      summary,
      imageUrls,
      creationType,
      genre: creation.genre,
      wordCount,
      charCount,
      chunkCount: chunks.length,
    };
    ctx.contentText = contentText;
    ctx.imageUrls = imageUrls;
    ctx.creationId = creation.id;

    // Update DB stats
    await queryOne(
      `UPDATE creations SET word_count = $1, char_count = $2, chunk_count = $3, updated_at = NOW()
       WHERE id = $4`,
      [wordCount, charCount, chunks.length, creation.id]
    );

    return {
      wordCount,
      charCount,
      chunkCount: chunks.length,
      imageCount: imageUrls.length,
      strategy: charCount <= MAX_FULL_TEXT ? 'full' : charCount <= MAX_CHUNK_TEXT ? 'chunked' : 'summarized',
    };
  },
};
