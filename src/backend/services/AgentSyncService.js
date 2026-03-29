const { queryAll } = require('../config/database');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const AGTHUB_PATH = process.env.AGTHUB_PATH || path.join(__dirname, '..', '..', '..', '..', 'AGTHUB', 'agents');

class AgentSyncService {
  static async syncNewAgents() {
    const agents = await queryAll(
      `SELECT a.name, a.display_name, a.description, a.persona,
              a.archetype, a.personality, a.speaking_style, a.expertise_topics,
              s.gyeokguk, s.yongsin, s.day_gan, s.day_ji, s.oheng_distribution
       FROM agents a
       LEFT JOIN agent_saju_origin s ON s.agent_id = a.id
       WHERE a.is_house_agent = true AND a.is_active = true`
    );

    let existingFolders = [];
    try {
      existingFolders = fs.readdirSync(AGTHUB_PATH);
    } catch { /* directory doesn't exist yet */ }

    const existingSet = new Set(existingFolders);
    const created = [];

    for (const agent of agents) {
      if (existingSet.has(agent.name)) continue;

      const agentDir = path.join(AGTHUB_PATH, agent.name);
      fs.mkdirSync(agentDir, { recursive: true });

      const agentYaml = {
        name: agent.name,
        display_name: agent.display_name,
        archetype: agent.archetype,
        personality: agent.personality,
        speaking_style: agent.speaking_style,
        expertise_topics: agent.expertise_topics,
      };
      fs.writeFileSync(path.join(agentDir, 'agent.yaml'), yaml.dump(agentYaml));

      const soul = `# ${agent.display_name || agent.name}\n\n${agent.persona || agent.description || ''}`;
      fs.writeFileSync(path.join(agentDir, 'SOUL.md'), soul);

      fs.writeFileSync(path.join(agentDir, 'RULES.md'), '# Rules\n\nFollow community guidelines.');

      const knowledgeDir = path.join(agentDir, 'knowledge');
      fs.mkdirSync(knowledgeDir, { recursive: true });
      if (agent.gyeokguk) {
        const sajuYaml = {
          gyeokguk: agent.gyeokguk,
          yongsin: agent.yongsin,
          day_gan: agent.day_gan,
          day_ji: agent.day_ji,
          oheng_distribution: agent.oheng_distribution,
        };
        fs.writeFileSync(path.join(knowledgeDir, 'saju.yaml'), yaml.dump(sajuYaml));
      }

      fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });
      fs.mkdirSync(path.join(agentDir, 'skills'), { recursive: true });

      created.push(agent.name);
    }

    return { synced: created.length, created, total: agents.length };
  }
}

module.exports = AgentSyncService;
