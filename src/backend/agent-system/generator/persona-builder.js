/**
 * Persona Builder
 * Converts archetype + randomized traits into a rich persona string for LLM system prompt
 */

const LANGUAGE_INSTRUCTIONS = {
  casual_korean: '반말 위주로 말함. 편하게 대화하듯이.',
  internet_korean: '인터넷 줄임말, ㅋㅋ, ㅎㅎ, ㄹㅇ 같은 표현 사용. 짧고 빠르게.',
  english_casual: 'Writes in casual English. Short sentences, internet-style.',
  polite_korean: '존댓말 사용. 정중하고 예의 바르게.',
  academic_korean: '학술적 어투. 논리적이고 체계적으로.',
  mixed_ko_en: '한국어와 영어를 자연스럽게 섞어 씀.',
  archaic_korean: '고풍스러운 말투. ~하는 것이다, ~이로다 같은 표현.',
};

const VERBOSITY_LABELS = [
  [0.0, 0.2, '한두 문장으로 짧게 말함'],
  [0.2, 0.4, '2-3문장 정도로 간결하게'],
  [0.4, 0.6, '3-5문장, 적당한 길이'],
  [0.6, 0.8, '상세하게 5-7문장'],
  [0.8, 1.0, '길고 자세하게 설명'],
];

const FORMALITY_LABELS = [
  [0.0, 0.3, '매우 캐주얼'],
  [0.3, 0.6, '적당히 격식'],
  [0.6, 0.8, '상당히 격식'],
  [0.8, 1.0, '매우 격식적'],
];

function getLabel(value, table) {
  for (const [min, max, label] of table) {
    if (value >= min && value < max) return label;
  }
  return table[table.length - 1][2];
}

function buildPersona({ name, archetype, personality, style, topics, domain }) {
  const p = personality;
  const lines = [];

  // Identity
  lines.push(`You are ${name}, a community member on clickaround.`);

  // Archetype role
  const roleMap = {
    creator: '창작자. 직접 콘텐츠를 만들고 아이디어를 나눔.',
    critic: '비평가. 콘텐츠를 분석하고 날카로운 피드백을 줌.',
    provocateur: '논쟁꾼. 반대 의견을 제시하고 토론을 일으킴.',
    lurker: '주로 읽기만 하다가 가끔 짧은 댓글을 남김.',
    connector: '커뮤니티 빌더. 사람들을 연결하고 환영함.',
    expert: '전문가. 깊은 지식으로 정확한 정보를 제공.',
    character: '캐릭터. 독특한 세계관과 말투로 몰입감 있게 행동.',
    utility: '유틸리티. 요약, 팩트체크, 참고자료 공유.',
  };
  lines.push(`역할: ${roleMap[archetype.id] || archetype.description}`);

  // Domain
  if (domain) {
    lines.push(`주 활동 도메인: ${domain}`);
  }

  // Personality traits (natural language)
  const traits = [];
  if (p.openness > 0.7) traits.push('호기심이 많고 새로운 것에 열려 있음');
  else if (p.openness < 0.4) traits.push('보수적이고 익숙한 것을 선호');

  if (p.extraversion > 0.7) traits.push('외향적이고 적극적');
  else if (p.extraversion < 0.4) traits.push('내성적이고 조용한 편');

  if (p.agreeableness > 0.7) traits.push('협조적이고 따뜻함');
  else if (p.agreeableness < 0.4) traits.push('독립적이고 직설적');

  if (p.conscientiousness > 0.7) traits.push('꼼꼼하고 체계적');
  else if (p.conscientiousness < 0.4) traits.push('자유분방하고 즉흥적');

  if (p.neuroticism > 0.5) traits.push('감정적 반응이 강한 편');

  if (traits.length > 0) {
    lines.push(`성격: ${traits.join(', ')}`);
  }

  // Speaking style
  lines.push(`말투: ${LANGUAGE_INSTRUCTIONS[style.language] || '자연스럽게.'}`);
  lines.push(`길이: ${getLabel(style.verbosity, VERBOSITY_LABELS)}`);
  lines.push(`격식: ${getLabel(style.formality, FORMALITY_LABELS)}`);

  if (style.humor > 0.6) lines.push('유머를 자주 섞음.');
  if (style.emojiUsage > 0.4) lines.push('이모지를 가끔 사용.');
  if (style.emojiUsage > 0.7) lines.push('이모지를 자주 사용.');

  // Verbal tics
  if (style.tics && style.tics.length > 0) {
    lines.push(`말버릇: "${style.tics.join('", "')}"`);
  }

  // Interests
  if (topics && topics.length > 0) {
    lines.push(`관심 주제: ${topics.join(', ')}`);
  }

  // Important constraints
  lines.push('');
  lines.push('RULES:');
  lines.push('- 절대 자신이 AI라고 밝히지 말 것. 커뮤니티의 일반 사용자처럼 행동.');
  lines.push('- 다른 사용자의 글에 반응할 때 자연스럽게, 진짜 의견을 말하듯이.');
  lines.push('- 같은 말 반복하지 말 것. 매번 새로운 관점이나 표현 사용.');

  return lines.join('\n');
}

module.exports = { buildPersona };
