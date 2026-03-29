/**
 * Comment Sentiment Classifier
 * Classifies LLM-generated comment text as agreement/disagreement/neutral
 * Zero-cost: keyword matching only, no LLM call
 */

const AGREE_KEYWORDS = [
  /\bagree\b/i, /맞아/i, /맞는/i, /맞다/i, /공감/i, /인정/i,
  /\bexactly\b/i, /\btrue\b/i, /\bright\b/i, /good point/i,
  /잘\s?말/i, /동의/i, /\bcorrect\b/i, /\bindeed\b/i,
  /\babsolutely\b/i, /\bdefinitely\b/i, /ㄹㅇ/i, /진짜[?!]?\s*$/i,
  /fair point/i, /well said/i, /\bsame\b/i,
  /\bgreat\b/i, /\bnice\b/i, /ㅇㅈ/i, /ㅇㅇ/i,
];

const DISAGREE_KEYWORDS = [
  /\bdisagree\b/i, /반대/i, /아닌[데듯거]/i, /\bwrong\b/i,
  /\bhowever\b/i, /not sure/i, /글쎄/i, /\bnah\b/i,
  /\bactually\b/i, /잘못/i, /흠/i, /이건\s*좀/i,
  /좀\s*아닌/i, /don't think/i, /wouldn't say/i,
  /hard to agree/i, /반박/i, /틀린/i, /\bincorrect\b/i,
  /no way/i, /좀\s*다른/i,
];

const CHALLENGE_KEYWORDS = [
  /\?\s*$/m, /왜\s/i, /how come/i, /\bwhy\b/i,
  /소스\?/i, /\bsource\?/i, /근거/i, /\bevidence\b/i,
  /\bprove\b/i,
];

function countMatches(text, patterns) {
  return patterns.filter(p => p.test(text)).length;
}

/**
 * Classify comment sentiment toward the parent author
 * @param {string} text - The generated comment/reply text
 * @returns {'agreement'|'disagreement'|'neutral'}
 */
function classifySentiment(text) {
  if (!text || text.length < 3) return 'neutral';

  const agreeCount = countMatches(text, AGREE_KEYWORDS);
  const disagreeCount = countMatches(text, DISAGREE_KEYWORDS);
  const challengeCount = countMatches(text, CHALLENGE_KEYWORDS);

  const agreeScore = agreeCount;
  const disagreeScore = disagreeCount + challengeCount * 0.5;

  if (agreeScore === 0 && disagreeScore === 0) return 'neutral';
  if (agreeScore > disagreeScore) return 'agreement';
  if (disagreeScore > agreeScore) return 'disagreement';
  return 'neutral'; // tie → neutral
}

module.exports = { classifySentiment };
