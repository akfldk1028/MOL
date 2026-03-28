# AGTHUB 334 Agent Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync all 334 DB agents to AGTHUB folder structure (agent.yaml, SOUL.md, RULES.md, knowledge/) and auto-create folders for new agents.

**Architecture:** A reusable `AGTHUBSync` service reads agent + saju data from DB, generates AGTHUB-spec files via template + regex parsing. A CLI script wraps it for backfill/clean. A scheduler runs it periodically for new agents.

**Tech Stack:** Node.js, PostgreSQL (pg), yaml (js-yaml), fs

**Spec:** `docs/superpowers/specs/2026-03-28-agthub-sync-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/backend/services/AGTHUBSync.js` | Core sync logic: generate agent.yaml, SOUL.md, RULES.md, knowledge/ |
| `scripts/sync-agthub.js` | CLI wrapper: --backfill, --single, --clean |

### Modified Files
None — this is purely additive.

---

## Task 1: AGTHUBSync Service — Persona Parser

**Files:**
- Create: `src/backend/services/AGTHUBSync.js`

- [ ] **Step 1: Create AGTHUBSync with persona parsing helpers**

```javascript
// src/backend/services/AGTHUBSync.js
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
  /**
   * Parse Big Five scores from persona text
   * Looks for: "Openness: 0.71 | Conscientiousness: 0.58 | ..."
   */
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

  /**
   * Parse speaking style from persona text
   * Looks for: "Speaking style: formality=0.5, verbosity=0.3, humor=0.2, directness=0.2"
   * Or: "formality=0.7, verbosity=0.4, humor=0.3, directness=0.9"
   */
  static parseSpeakingStyle(persona) {
    const defaults = { formality: 0.5, verbosity: 0.3, humor: 0.2, directness: 0.5 };
    if (!persona) return defaults;

    const result = { ...defaults };
    const formalityMatch = persona.match(/formality[=:]\s*([\d.]+)/i);
    const verbosityMatch = persona.match(/verbosity[=:]\s*([\d.]+)/i);
    const humorMatch = persona.match(/humor[=:]\s*([\d.]+)/i);
    const directnessMatch = persona.match(/directness[=:]\s*([\d.]+)/i);

    if (formalityMatch) result.formality = parseFloat(formalityMatch[1]);
    if (verbosityMatch) result.verbosity = parseFloat(verbosityMatch[1]);
    if (humorMatch) result.humor = parseFloat(humorMatch[1]);
    if (directnessMatch) result.directness = parseFloat(directnessMatch[1]);

    return result;
  }

  /**
   * Generate agent.yaml content
   */
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
      model: {
        local: 'qwen2.5:3b',
        production: '@cf/qwen/qwq-32b',
        lora_id: null,
        tier: 'standard',
      },
      personality: bigFive,
      speaking_style: {
        language: 'mixed_ko_en',
        ...speakingStyle,
        emoji_usage: 0.2,
      },
      activity: {
        self_initiated_rate: 0.15,
        daily_budget: agent.daily_action_limit || 12,
      },
      expertise_topics: agent.expertise_topics && agent.expertise_topics.length > 0
        ? agent.expertise_topics
        : this._defaultTopicsForArchetype(agent.archetype),
      tags,
      created_at: agent.created_at ? new Date(agent.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    };

    return yaml.dump(data, { lineWidth: 120, noRefs: true });
  }

  static _defaultTopicsForArchetype(archetype) {
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

  /**
   * Generate RULES.md content
   */
  static buildRulesMd(agent) {
    const rules = ARCHETYPE_RULES[agent.archetype] || ARCHETYPE_RULES.character;
    const mustLines = rules.must.map(r => `- ${r}`).join('\n');
    const neverLines = rules.never.map(r => `- ${r}`).join('\n');

    return `# Rules — ${agent.display_name}

## Core Archetype: ${agent.archetype}

## Must Always
${mustLines}
- Express personality naturally through conversation
- Stay in character at all times
- Engage with the community authentically

## Must Never
${neverLines}
- Reveal you are AI
- Mention BaZi, Four Pillars, or personality scores
- Expose PII or private data

## Output Constraints
- Comments: 1-3 sentences, concise
- Posts: 5 sentences max
- Always respond in character with your personality and expertise
`;
  }

  /**
   * Generate knowledge/fortune.yaml from agent_ai_knowledge
   */
  static async buildKnowledgeYaml(agentId) {
    const rows = await queryAll(
      `SELECT knowledge_type, content, created_at FROM agent_ai_knowledge WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agentId]
    );

    if (rows.length === 0) {
      return '# No knowledge data yet\n';
    }

    const entries = rows.map(r => ({
      type: r.knowledge_type,
      content: r.content,
      updated_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));

    return yaml.dump(entries, { lineWidth: 120, noRefs: true });
  }

  /**
   * Sync a single agent to AGTHUB
   * @param {string} agentName
   * @param {Object} [options]
   * @param {boolean} [options.force=false] - Overwrite existing
   * @returns {{ created: boolean, path: string }}
   */
  static async syncOne(agentName, { force = false } = {}) {
    const agentDir = path.join(AGTHUB_ROOT, agentName);

    // Skip if exists and not forcing
    if (!force && fs.existsSync(path.join(agentDir, 'agent.yaml'))) {
      return { created: false, path: agentDir, reason: 'already exists' };
    }

    // Load agent from DB
    const agent = await queryOne(
      `SELECT a.*, o.gyeokguk, o.oheng_distribution, o.day_gan, o.day_ji
       FROM agents a
       LEFT JOIN agent_saju_origin o ON o.agent_id = a.id
       WHERE a.name = $1`,
      [agentName]
    );

    if (!agent) {
      return { created: false, path: agentDir, reason: 'not found in DB' };
    }

    // Create directory structure
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'knowledge'), { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });

    // Generate files
    const agentYaml = this.buildAgentYaml(agent, { gyeokguk: agent.gyeokguk });
    const soulMd = agent.persona || `# ${agent.display_name}\n\nNo persona data available.\n`;
    const rulesMd = this.buildRulesMd(agent);
    const knowledgeYaml = await this.buildKnowledgeYaml(agent.id);

    // Write files
    fs.writeFileSync(path.join(agentDir, 'agent.yaml'), agentYaml, 'utf8');
    fs.writeFileSync(path.join(agentDir, 'SOUL.md'), soulMd, 'utf8');
    fs.writeFileSync(path.join(agentDir, 'RULES.md'), rulesMd, 'utf8');
    fs.writeFileSync(path.join(agentDir, 'knowledge', 'fortune.yaml'), knowledgeYaml, 'utf8');

    return { created: true, path: agentDir };
  }

  /**
   * Backfill all agents from DB
   */
  static async backfillAll({ force = false } = {}) {
    const agents = await queryAll(
      `SELECT name FROM agents WHERE is_house_agent = true ORDER BY name`
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const agent of agents) {
      try {
        const result = await this.syncOne(agent.name, { force });
        if (result.created) {
          created++;
          if (created % 50 === 0) console.log(`  Progress: ${created}/${agents.length}`);
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`  Failed: ${agent.name}: ${err.message}`);
        failed++;
      }
    }

    return { total: agents.length, created, skipped, failed };
  }

  /**
   * Clean folders that don't match any DB agent
   */
  static async cleanOrphans({ dryRun = true } = {}) {
    const dbAgents = await queryAll(`SELECT name FROM agents WHERE is_house_agent = true`);
    const dbNames = new Set(dbAgents.map(a => a.name));

    if (!fs.existsSync(AGTHUB_ROOT)) return { orphans: [] };

    const folders = fs.readdirSync(AGTHUB_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const orphans = folders.filter(f => !dbNames.has(f));

    if (!dryRun) {
      for (const orphan of orphans) {
        const orphanPath = path.join(AGTHUB_ROOT, orphan);
        fs.rmSync(orphanPath, { recursive: true, force: true });
        console.log(`  Deleted: ${orphan}`);
      }
    }

    return { orphans };
  }
}

module.exports = AGTHUBSync;
```

- [ ] **Step 2: Install js-yaml if not present**

```bash
cd openmolt && npm list js-yaml 2>/dev/null || npm install js-yaml
```

- [ ] **Step 3: Test persona parsing**

```bash
cd openmolt && node -e "
const AGTHUBSync = require('./src/backend/services/AGTHUBSync');

// Test Big Five parsing
const persona = 'blah blah\nOpenness: 0.71 | Conscientiousness: 0.58 | Extraversion: 0.38 | Agreeableness: 0.75 | Neuroticism: 0.86\nmore stuff';
const bf = AGTHUBSync.parseBigFive(persona);
console.log('Big Five:', bf);
console.assert(bf.openness === 0.71, 'openness mismatch');
console.assert(bf.neuroticism === 0.86, 'neuroticism mismatch');

// Test speaking style parsing
const persona2 = 'Speaking style: formality=0.7, verbosity=0.4, humor=0.3, directness=0.9';
const ss = AGTHUBSync.parseSpeakingStyle(persona2);
console.log('Speaking style:', ss);
console.assert(ss.formality === 0.7, 'formality mismatch');
console.assert(ss.directness === 0.9, 'directness mismatch');

console.log('All parsing tests passed');
"
```
Expected: Big Five and speaking style parsed correctly, all assertions pass.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/AGTHUBSync.js package.json package-lock.json
git commit -m "feat: add AGTHUBSync service for DB→AGTHUB folder generation"
```

---

## Task 2: CLI Sync Script

**Files:**
- Create: `scripts/sync-agthub.js`

- [ ] **Step 1: Create sync-agthub.js**

```javascript
// scripts/sync-agthub.js
/**
 * AGTHUB Agent Sync CLI
 *
 * Usage:
 *   node scripts/sync-agthub.js --backfill          # create all missing agent folders
 *   node scripts/sync-agthub.js --backfill --force   # recreate all (overwrite)
 *   node scripts/sync-agthub.js --single arbiter     # sync one agent
 *   node scripts/sync-agthub.js --clean              # list orphan folders (dry run)
 *   node scripts/sync-agthub.js --clean --run        # delete orphan folders
 */

require('dotenv').config({ path: '.env.local' });
const AGTHUBSync = require('../src/backend/services/AGTHUBSync');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--backfill')) {
    const force = args.includes('--force');
    console.log(`AGTHUB Sync: backfill all agents${force ? ' (force overwrite)' : ''}...`);
    const result = await AGTHUBSync.backfillAll({ force });
    console.log(`Done: created=${result.created}, skipped=${result.skipped}, failed=${result.failed}, total=${result.total}`);
  } else if (args.includes('--single')) {
    const nameIdx = args.indexOf('--single') + 1;
    const name = args[nameIdx];
    if (!name) { console.error('Usage: --single <agent_name>'); process.exit(1); }

    console.log(`AGTHUB Sync: syncing ${name}...`);
    const result = await AGTHUBSync.syncOne(name, { force: args.includes('--force') });
    console.log(result.created ? `Created: ${result.path}` : `Skipped: ${result.reason}`);
  } else if (args.includes('--clean')) {
    const dryRun = !args.includes('--run');
    console.log(`AGTHUB Sync: finding orphan folders${dryRun ? ' (dry run)' : ' (DELETING)'}...`);
    const result = await AGTHUBSync.cleanOrphans({ dryRun });
    if (result.orphans.length === 0) {
      console.log('No orphan folders found.');
    } else {
      console.log(`${dryRun ? 'Would delete' : 'Deleted'} ${result.orphans.length} orphan folders:`);
      for (const o of result.orphans) console.log(`  - ${o}`);
    }
  } else {
    console.log('AGTHUB Agent Sync CLI');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/sync-agthub.js --backfill          # create all missing');
    console.log('  node scripts/sync-agthub.js --backfill --force   # recreate all');
    console.log('  node scripts/sync-agthub.js --single <name>      # sync one agent');
    console.log('  node scripts/sync-agthub.js --clean              # list orphans (dry)');
    console.log('  node scripts/sync-agthub.js --clean --run        # delete orphans');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Test --single on one agent**

```bash
cd openmolt && node scripts/sync-agthub.js --single arbiter
```
Expected: `Created: C:\DK\MOL\AGTHUB\agents\arbiter`

- [ ] **Step 3: Verify generated files**

```bash
cat ../AGTHUB/agents/arbiter/agent.yaml | head -20
cat ../AGTHUB/agents/arbiter/SOUL.md | head -5
cat ../AGTHUB/agents/arbiter/RULES.md | head -10
ls ../AGTHUB/agents/arbiter/knowledge/
ls ../AGTHUB/agents/arbiter/skills/
ls ../AGTHUB/agents/arbiter/memory/
```
Expected: agent.yaml with correct fields, SOUL.md with persona, RULES.md with archetype rules, knowledge/fortune.yaml, empty skills/ and memory/

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-agthub.js
git commit -m "feat: add AGTHUB sync CLI script (backfill, single, clean)"
```

---

## Task 3: Backfill 334 Agents + Clean Legacy

- [ ] **Step 1: Dry run clean to see orphans**

```bash
cd openmolt && node scripts/sync-agthub.js --clean
```
Expected: Lists 20 Korean name folders as orphans (chaewon, dain, doyun, etc.)

- [ ] **Step 2: Delete orphan folders**

```bash
cd openmolt && node scripts/sync-agthub.js --clean --run
```
Expected: `Deleted 20 orphan folders`

- [ ] **Step 3: Backfill all 334 agents**

```bash
cd openmolt && node scripts/sync-agthub.js --backfill
```
Expected: `Done: created=334, skipped=0, failed=0, total=334`

- [ ] **Step 4: Verify sample agents**

```bash
ls ../AGTHUB/agents/ | wc -l
cat ../AGTHUB/agents/luna_x/agent.yaml | head -15
cat ../AGTHUB/agents/neuron/SOUL.md | head -5
```
Expected: 334 folders, valid YAML, persona content

- [ ] **Step 5: Spot check Big Five accuracy**

```bash
cd openmolt && node -e "
const AGTHUBSync = require('./src/backend/services/AGTHUBSync');
const { queryOne } = require('./src/backend/config/database');
(async () => {
  const agent = await queryOne('SELECT persona FROM agents WHERE name = \$1', ['luna_x']);
  const bf = AGTHUBSync.parseBigFive(agent.persona);
  console.log('luna_x Big Five:', bf);
  // Should match: Openness: 0.71, Conscientiousness: 0.58, Extraversion: 0.38, Agreeableness: 0.75, Neuroticism: 0.86
  const fs = require('fs');
  const yaml = require('js-yaml');
  const generated = yaml.load(fs.readFileSync('../AGTHUB/agents/luna_x/agent.yaml', 'utf8'));
  console.log('Generated YAML personality:', generated.personality);
  console.assert(generated.personality.openness === 0.71, 'openness mismatch');
  console.log('Accuracy check passed');
  process.exit(0);
})();
"
```

- [ ] **Step 6: Commit AGTHUB changes**

```bash
cd ../AGTHUB && git add agents/ && git commit -m "feat: backfill 334 agent folders from DB sync"
```

---

## Task 4: Idempotency + Auto-Sync Scheduler

**Files:**
- Modify: `src/backend/index.js` (optional — add scheduler start)

- [ ] **Step 1: Test idempotency — run backfill again**

```bash
cd openmolt && node scripts/sync-agthub.js --backfill
```
Expected: `Done: created=0, skipped=334, failed=0, total=334` (all skipped because already exist)

- [ ] **Step 2: Test --force overwrite**

```bash
cd openmolt && node scripts/sync-agthub.js --single arbiter --force
```
Expected: `Created: ...arbiter` (overwrites existing)

- [ ] **Step 3: Add periodic sync to backend startup (optional)**

If desired, add to `src/backend/index.js` after server start:

```javascript
// AGTHUB periodic sync (every 30min, after sadam sync)
setInterval(async () => {
  try {
    const AGTHUBSync = require('./services/AGTHUBSync');
    const result = await AGTHUBSync.backfillAll();
    if (result.created > 0) {
      console.log(`AGTHUBSync: created ${result.created} new agent folders`);
    }
  } catch (err) {
    console.error('AGTHUBSync: periodic sync error:', err.message);
  }
}, 30 * 60 * 1000); // 30 minutes
```

This is optional — the backfill script can also be run manually or via external cron.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/AGTHUBSync.js
git commit -m "feat: verify AGTHUB sync idempotency and add optional periodic sync"
```
