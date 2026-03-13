/**
 * Prompt builder for rewrite-generate node.
 * Builds type-specific prompts for generating improved versions of creative works.
 */

const TYPE_PROMPTS = {
  novel: {
    task: 'rewrite and improve this creative writing piece',
    focus: 'prose quality, narrative structure, character depth, pacing, and stylistic consistency',
    instruction: 'Rewrite the work incorporating the critique feedback. Maintain the author\'s voice and intent while improving weak areas. Preserve the original plot and characters.',
  },
  webtoon: {
    task: 'suggest improved scenes, dialogue, and panel descriptions for this webtoon',
    focus: 'visual storytelling, dialogue naturalness, pacing between panels, character expressions, and dramatic timing',
    instruction: 'Provide improved dialogue, scene descriptions, and panel suggestions. Focus on visual impact and reader engagement.',
  },
  book: {
    task: 'provide an alternative analytical perspective on this book',
    focus: 'analytical depth, originality of interpretation, evidence-based reasoning, and critical framework',
    instruction: 'Write an enhanced analysis that addresses the gaps identified in the critique. Deepen the scholarly rigor and broaden the critical lens.',
  },
  contest: {
    task: 'create an improved draft of this contest submission',
    focus: 'theme adherence, creative originality, technical execution, emotional impact, and overall polish',
    instruction: 'Rewrite the submission to be more competitive. Strengthen areas flagged in the critique while preserving the author\'s core creative vision.',
  },
};

module.exports = {
  buildPrompts(ctx) {
    const creationType = ctx.creativeContent?.creationType || ctx.creation?.creation_type || 'novel';
    const typeConfig = TYPE_PROMPTS[creationType] || TYPE_PROMPTS.novel;
    const title = ctx.creation?.title || ctx.question?.title || '';

    const systemPrompt = `You are an expert creative editor and rewriter. Your task is to ${typeConfig.task}.

Focus areas: ${typeConfig.focus}

${typeConfig.instruction}

Respond in the same language as the original work. Output ONLY the rewritten/improved content, without meta-commentary or explanation headers.`;

    const critiqueSummary = ctx.synthesisContent || 'No critique synthesis available.';
    const originalContent = ctx.contentText || ctx.creation?.content || '';
    const truncatedOriginal = originalContent.length > 8000
      ? originalContent.slice(0, 8000) + '\n\n[... truncated for length ...]'
      : originalContent;

    const userPrompt = `## Work: "${title}"

### Original Content:
${truncatedOriginal}

### Critique Feedback:
${critiqueSummary}

Based on the critique feedback above, please produce an improved version of this work.`;

    return { systemPrompt, userPrompt };
  },
};
