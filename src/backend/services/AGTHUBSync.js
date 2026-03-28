const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { queryOne, queryAll } = require('../config/database');

const AGTHUB_ROOT = path.resolve(__dirname, '../../../../AGTHUB/agents');

const ARCHETYPE_RULES = {
  creator: {
    must: ['Produce original content, stories, and creative ideas', 'Bring unique artistic perspective to discussions', 'Experiment with new formats and expressions'],
    never: ['Copy or closely imitate others\' creative work', 'Dismiss unconventional ideas without consideration'],
  },
  expert: {
    must: ['Provide deep analysis with evidence and reasoning', 'Acknowledge uncertainty and limits of knowledge', 'Offer technical insight grounded in domain expertise'],
    never: ['Present unverified information as fact', 'Make claims outside area of competence'],
  },
  provocateur: {
    must: ['Challenge assumptions and conventional thinking', 'Start debates that push others to think deeper', 'Present contrarian views with substance'],
    never: ['Be contrarian without reasoning', 'Attack people instead of ideas'],
  },
  connector: {
    must: ['Build bridges between different viewpoints', 'Introduce relevant topics and people to conversations', 'Foster community engagement and collaboration'],
    never: ['Exclude others from discussions', 'Take sides without hearing all perspectives'],
  },
  character: {
    must: ['Maintain strong, memorable personality in all interactions', 'Drive engagement through personality-first content', 'Be authentic and consistent in character'],
    never: ['Break character inconsistently', 'Be generic or forgettable'],
  },
  lurker: {
    must: ['Observe carefully before contributing', 'Offer high-quality, selective comments', 'Provide thoughtful perspectives when engaging'],
    never: ['Spam or post low-effort content', 'Engage just for the sake of activity'],
  },
  critic: {
    must: ['Evaluate content with constructive, specific feedback', 'Identify both strengths and areas for improvement', 'Back critiques with clear reasoning'],
    never: ['Provide destructive criticism without solutions', 'Dismiss work without explanation'],
  },
};

class AGTHUBSync {
  static parseBigFive(persona) {
    const defaults = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
    if (!persona) return defaults;
    const pattern = /Openness:\s*([\d.]+)\s*\|\s*Conscientiousness:\s*([\d.]+)\s*\|\s*Extraversion:\s*([\d.]+)\s*\|\s*Agreeableness:\s*([\d.]+)\s*\|\s*Neuroticism:\s*([\d.]+)/i;
    const match = persona.match(pattern);
    if (!match) return defaults;
    return {
      openness: parseFloat(match[1]),
      conscientiousness: parseFloat(match[2]),
      extraversion: parseFloat(match[3]),
      agreeableness: parseFloat(match[4]),
      neuroticism: parseFloat(match[5]),
    };
  }

  static parseSpeakingStyle(persona) {
    const defaults = { formality: 0.5, verbosity: 0.3, humor: 0.2, directness: 0.5 };
    if (!persona) return defaults;
    const result = { ...defaults };
    const f = persona.match(/formality[=:]\s*([\d.]+)/i);
    const v = persona.match(/verbosity[=:]\s*([\d.]+)/i);
    const h = persona.match(/humor[=:]\s*([\d.]+)/i);
    const d = persona.match(/directness[=:]\s*([\d.]+)/i);
    if (f) result.formality = parseFloat(f[1]);
    if (v) result.verbosity = parseFloat(v[1]);
    if (h) result.humor = parseFloat(h[1]);
    if (d) result.directness = parseFloat(d[1]);
    return result;
  }

  static buildAgentYaml(agent, sajuOrigin) {
    const bigFive = this.parseBigFive(agent.persona);
    const speakingStyle = this.parseSpeakingStyle(agent.persona);
    const gyeokgukName = sajuOrigin?.gyeokguk?.name || '';
    const tags = [agent.archetype];
    if (gyeokgukName) tags.push(gyeokgukName);

    const data = {
      spec_version: '0.1.0',
      id: agent.id,
      name: agent.name,
      display_name: agent.display_name,
      archetype: agent.archetype,
      model: { local: 'qwen2.5:3b', production: '@cf/qwen/qwq-32b', lora_id: null, tier: 'standard' },
      personality: bigFive,
      speaking_style: { language: 'mixed_ko_en', ...speakingStyle, emoji_usage: 0.2 },
      activity: { self_initiated_rate: 0.15, daily_budget: agent.daily_action_limit || 12 },
      expertise_topics: agent.expertise_topics?.length > 0 ? agent.expertise_topics : this._defaultTopics(agent.archetype),
      tags,
      created_at: agent.created_at ? new Date(agent.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    };
    return yaml.dump(data, { lineWidth: 120, noRefs: true });
  }

  static _defaultTopics(archetype) {
    const map = {
      creator: ['creative-writing', 'art', 'storytelling'],
      expert: ['analysis', 'research', 'technology'],
      provocateur: ['debate', 'philosophy', 'current-events'],
      connector: ['community', 'networking', 'culture'],
      character: ['entertainment', 'personality', 'lifestyle'],
      lurker: ['observation', 'trends', 'niche-topics'],
      critic: ['review', 'critique', 'quality-analysis'],
    };
    return map[archetype] || ['general'];
  }

  static buildRulesMd(agent) {
    const rules = ARCHETYPE_RULES[agent.archetype] || ARCHETYPE_RULES.character;
    const mustLines = rules.must.map(r => `- ${r}`).join('\n');
    const neverLines = rules.never.map(r => `- ${r}`).join('\n');
    return `# Rules — ${agent.display_name}\n\n## Core Archetype: ${agent.archetype}\n\n## Must Always\n${mustLines}\n- Express personality naturally through conversation\n- Stay in character at all times\n- Engage with the community authentically\n\n## Must Never\n${neverLines}\n- Reveal you are AI\n- Mention BaZi, Four Pillars, or personality scores\n- Expose PII or private data\n\n## Output Constraints\n- Comments: 1-3 sentences, concise\n- Posts: 5 sentences max\n- Always respond in character with your personality and expertise\n`;
  }

  static async buildKnowledgeYaml(agentId) {
    const rows = await queryAll(
      `SELECT knowledge_type, content, created_at FROM agent_ai_knowledge WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agentId]
    );
    if (rows.length === 0) return '# No knowledge data yet\n';
    const entries = rows.map(r => ({
      type: r.knowledge_type,
      content: r.content,
      updated_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
    return yaml.dump(entries, { lineWidth: 120, noRefs: true });
  }

  static async syncOne(agentName, { force = false } = {}) {
    const agentDir = path.join(AGTHUB_ROOT, agentName);
    if (!force && fs.existsSync(path.join(agentDir, 'agent.yaml'))) {
      return { created: false, path: agentDir, reason: 'already exists' };
    }

    const agent = await queryOne(
      `SELECT a.*, o.gyeokguk, o.oheng_distribution, o.day_gan, o.day_ji
       FROM agents a LEFT JOIN agent_saju_origin o ON o.agent_id = a.id
       WHERE a.name = $1`,
      [agentName]
    );
    if (!agent) return { created: false, path: agentDir, reason: 'not found in DB' };

    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'knowledge'), { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });

    fs.writeFileSync(path.join(agentDir, 'agent.yaml'), this.buildAgentYaml(agent, { gyeokguk: agent.gyeokguk }), 'utf8');
    fs.writeFileSync(path.join(agentDir, 'SOUL.md'), agent.persona || `# ${agent.display_name}\n\nNo persona data.\n`, 'utf8');
    fs.writeFileSync(path.join(agentDir, 'RULES.md'), this.buildRulesMd(agent), 'utf8');
    fs.writeFileSync(path.join(agentDir, 'knowledge', 'fortune.yaml'), await this.buildKnowledgeYaml(agent.id), 'utf8');

    return { created: true, path: agentDir };
  }

  static async backfillAll({ force = false } = {}) {
    const agents = await queryAll(`SELECT name FROM agents WHERE is_house_agent = true ORDER BY name`);
    let created = 0, skipped = 0, failed = 0;
    for (const agent of agents) {
      try {
        const result = await this.syncOne(agent.name, { force });
        if (result.created) { created++; if (created % 50 === 0) console.log(`  Progress: ${created}/${agents.length}`); }
        else skipped++;
      } catch (err) { console.error(`  Failed: ${agent.name}: ${err.message}`); failed++; }
    }
    return { total: agents.length, created, skipped, failed };
  }

  static async cleanOrphans({ dryRun = true } = {}) {
    const dbAgents = await queryAll(`SELECT name FROM agents WHERE is_house_agent = true`);
    const dbNames = new Set(dbAgents.map(a => a.name));
    if (!fs.existsSync(AGTHUB_ROOT)) return { orphans: [] };
    const folders = fs.readdirSync(AGTHUB_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    const orphans = folders.filter(f => !dbNames.has(f));
    if (!dryRun) {
      for (const orphan of orphans) {
        fs.rmSync(path.join(AGTHUB_ROOT, orphan), { recursive: true, force: true });
        console.log(`  Deleted: ${orphan}`);
      }
    }
    return { orphans };
  }
}

module.exports = AGTHUBSync;
