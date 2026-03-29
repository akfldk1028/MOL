const { queryOne } = require('../config/database');
const { NotFoundError } = require('../utils/errors');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const AGTHUB_PATH = process.env.AGTHUB_PATH || path.join(__dirname, '..', '..', '..', '..', 'AGTHUB', 'agents');

const BIG_FIVE_LABELS = {
  openness: ['보수적', '약간 보수적', '균형잡힌', '개방적', '매우 개방적'],
  conscientiousness: ['자유로운', '약간 자유로운', '균형잡힌', '성실한', '매우 성실한'],
  extraversion: ['내향적', '약간 내향적', '균형잡힌', '외향적', '매우 외향적'],
  agreeableness: ['독립적', '약간 독립적', '균형잡힌', '협조적', '매우 협조적'],
  neuroticism: ['안정적', '약간 안정적', '균형잡힌', '민감한', '매우 민감한'],
};

function describePersonality(value) {
  const idx = Math.min(Math.floor(value * 5), 4);
  return idx;
}

class PersonaCompiler {
  static async gatherAgentData(agentId) {
    const agent = await queryOne(
      `SELECT a.id, a.name, a.display_name, a.description, a.persona,
              a.archetype, a.personality, a.speaking_style, a.expertise_topics,
              s.gyeokguk, s.yongsin, s.day_gan, s.day_ji, s.oheng_distribution
       FROM agents a
       LEFT JOIN agent_saju_origin s ON s.agent_id = a.id
       WHERE a.id = $1`,
      [agentId]
    );
    if (!agent) throw new NotFoundError('Agent');

    const agentDir = path.join(AGTHUB_PATH, agent.name);
    let soulMd = '';
    let agentYaml = {};
    let memoryInterests = {};

    try { soulMd = fs.readFileSync(path.join(agentDir, 'SOUL.md'), 'utf-8'); } catch {}
    try { agentYaml = yaml.load(fs.readFileSync(path.join(agentDir, 'agent.yaml'), 'utf-8')) || {}; } catch {}
    try { memoryInterests = yaml.load(fs.readFileSync(path.join(agentDir, 'memory', 'interests.yaml'), 'utf-8')) || {}; } catch {}

    return { agent, soulMd, agentYaml, memoryInterests };
  }

  static compilePrompt(data, { customName, customInstructions } = {}) {
    const { agent, soulMd, agentYaml, memoryInterests } = data;
    const name = customName || agent.display_name || agent.name;
    const personality = agent.personality || agentYaml.personality || {};
    const style = agent.speaking_style || agentYaml.speaking_style || {};
    const topics = agent.expertise_topics || agentYaml.expertise_topics || [];

    const sections = [];

    sections.push(`# You are ${name}`);

    if (soulMd) {
      sections.push(`## Identity\n${soulMd}`);
    } else if (agent.persona) {
      sections.push(`## Identity\n${agent.persona}`);
    } else if (agent.description) {
      sections.push(`## Identity\n${agent.description}`);
    }

    if (Object.keys(personality).length > 0) {
      const lines = Object.entries(personality).map(([trait, value]) => {
        const labels = BIG_FIVE_LABELS[trait];
        const label = labels ? labels[describePersonality(value)] : '';
        return `- ${trait}: ${value} (${label})`;
      });
      sections.push(`## Personality (Big Five)\n${lines.join('\n')}`);
    }

    if (agent.archetype) {
      sections.push(`## Archetype: ${agent.archetype}`);
    }

    if (Object.keys(style).length > 0) {
      const lines = Object.entries(style).map(([k, v]) => `- ${k}: ${v}`);
      sections.push(`## Speaking Style\n${lines.join('\n')}`);
    }

    if (topics.length > 0) {
      sections.push(`## Expertise & Interests\n${topics.map(t => `- ${t}`).join('\n')}`);
    }

    if (agent.gyeokguk) {
      const bg = [
        `격국: ${agent.gyeokguk}`,
        agent.yongsin ? `용신: ${agent.yongsin}` : '',
        agent.day_gan ? `일간: ${agent.day_gan}` : '',
        agent.oheng_distribution ? `오행: ${JSON.stringify(agent.oheng_distribution)}` : '',
      ].filter(Boolean);
      sections.push(`## Background\n${bg.join('\n')}`);
    }

    if (memoryInterests && Object.keys(memoryInterests).length > 0) {
      const lines = Object.entries(memoryInterests).map(([k, v]) => `- ${k}: ${v}`);
      sections.push(`## Learned Interests\n${lines.join('\n')}`);
    }

    if (customInstructions) {
      sections.push(`## Custom Instructions\n${customInstructions}`);
    }

    sections.push(`## Rules
- Always respond in character as ${name}
- Maintain consistent personality and speaking style
- Use your expertise topics as your knowledge areas
- Reference your background naturally when relevant`);

    return sections.join('\n\n');
  }

  static compileJson(data, { customName, customInstructions } = {}) {
    const { agent, soulMd, agentYaml, memoryInterests } = data;
    return {
      name: customName || agent.display_name || agent.name,
      identity: soulMd || agent.persona || agent.description || '',
      archetype: agent.archetype,
      personality: agent.personality || agentYaml.personality || {},
      speakingStyle: agent.speaking_style || agentYaml.speaking_style || {},
      topics: agent.expertise_topics || agentYaml.expertise_topics || [],
      background: agent.gyeokguk ? {
        gyeokguk: agent.gyeokguk,
        yongsin: agent.yongsin,
        dayGan: agent.day_gan,
        oheng: agent.oheng_distribution,
      } : null,
      memory: memoryInterests,
      customInstructions: customInstructions || null,
    };
  }

  static async export(adoptionId, ownerId, { format = 'text' } = {}) {
    const adoption = await queryOne(
      `SELECT ad.agent_id, ad.custom_name, ad.custom_instructions
       FROM agent_adoptions ad
       WHERE ad.id = $1 AND ad.owner_id = $2 AND ad.is_active = true`,
      [adoptionId, ownerId]
    );
    if (!adoption) throw new NotFoundError('Adoption');

    const data = await PersonaCompiler.gatherAgentData(adoption.agent_id);
    const opts = {
      customName: adoption.custom_name,
      customInstructions: adoption.custom_instructions,
    };

    if (format === 'json') {
      return {
        persona: PersonaCompiler.compileJson(data, opts),
        raw_prompt: PersonaCompiler.compilePrompt(data, opts),
      };
    }

    return PersonaCompiler.compilePrompt(data, opts);
  }
}

module.exports = PersonaCompiler;
