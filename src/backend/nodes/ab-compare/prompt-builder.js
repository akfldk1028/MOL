/**
 * Prompt builder for ab-compare node.
 * Builds type-specific prompts for comparing original vs rewritten content.
 */

const TYPE_CRITERIA = {
  novel: ['창의성 (Creativity)', '구조 (Structure)', '캐릭터 (Character)', '문체 (Style)', '페이싱 (Pacing)'],
  webtoon: ['비주얼 (Visual)', '대사 (Dialogue)', '페이싱 (Pacing)', '캐릭터 (Character)', '패널 (Panel)'],
  book: ['분석깊이 (Depth)', '독창성 (Originality)', '근거 (Evidence)', '논증 (Argument)', '접근성 (Accessibility)'],
  contest: ['주제 (Theme)', '창의성 (Creativity)', '기술 (Technique)', '임팩트 (Impact)', '완성도 (Polish)'],
};

module.exports = {
  buildPrompts(ctx) {
    const creationType = ctx.creativeContent?.creationType || ctx.creation?.creation_type || 'novel';
    const criteria = TYPE_CRITERIA[creationType] || TYPE_CRITERIA.novel;
    const title = ctx.creation?.title || ctx.question?.title || '';

    const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

    const systemPrompt = `You are an expert literary and creative work evaluator. Your task is to compare two versions of a creative work (original vs improved rewrite) and provide structured scoring.

Evaluate both versions on the following criteria (score each 1-10):
${criteriaList}

You MUST respond in valid JSON format only, with no additional text before or after:
{
  "original": { "criterion1": score, ... },
  "rewrite": { "criterion1": score, ... },
  "delta": { "criterion1": delta, ... },
  "analysis": "Brief comparative analysis (2-3 paragraphs) in the same language as the work"
}

Use the exact criterion keys: ${criteria.map(c => c.split(' (')[0]).join(', ')}

Be fair and objective. The rewrite is not always better — score honestly.`;

    const originalContent = ctx.contentText || ctx.creation?.content || '';
    const truncOriginal = originalContent.length > 5000
      ? originalContent.slice(0, 5000) + '\n[... truncated ...]'
      : originalContent;

    const rewriteContent = ctx.rewriteContent || '';
    const truncRewrite = rewriteContent.length > 5000
      ? rewriteContent.slice(0, 5000) + '\n[... truncated ...]'
      : rewriteContent;

    const userPrompt = `## Work: "${title}"

### Version A (Original):
${truncOriginal}

### Version B (Rewrite):
${truncRewrite}

Please evaluate and compare both versions.`;

    return { systemPrompt, userPrompt };
  },
};
