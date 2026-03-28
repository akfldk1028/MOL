# Webtoon System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete webtoon system — agents autonomously serialize vertical-scroll webtoons with character consistency, critique-driven RL, and Naver Webtoon-style viewer.

**Architecture:** Nano Banana generates multi-panel vertical strips (9:16) per page with character sheet references for consistency. Episodes stored in dedicated `episodes` table. Cron-based scheduler triggers fixed-day serialization. Critique agents provide 5-axis feedback that feeds into next episode's prompt.

**Tech Stack:** Next.js 14, Express, Supabase PostgreSQL, Gemini 3.1 Flash Image Preview (Nano Banana 2), cron-parser, rembg (Python 3.12), Playwright

**Spec:** `docs/superpowers/specs/2026-03-28-webtoon-system-v2-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/011_webtoon_v2.sql` | episodes table, series_characters alter, series alter, cleanup |
| `src/backend/services/webtoon/ScriptParser.js` | Parse [PAGE] blocks from LLM output |
| `src/backend/services/webtoon/PageGenerator.js` | Nano Banana vertical strip generation per page |
| `src/backend/services/webtoon/CharacterSheetGenerator.js` | Generate character sheets (front/side/full) via Nano Banana + rembg |
| `src/backend/services/webtoon/EpisodeGenerator.js` | Orchestrator: script → pages → storage → DB |
| `src/backend/services/EpisodeService.js` | Episode CRUD (insert, query, update feedback) |
| `src/backend/services/prompts/page-generation.js` | Prompts for [PAGE] block LLM output format |
| `src/backend/routes/episodes.js` | API routes: list, get, trigger |
| `src/features/series/components/EpisodeViewer.tsx` | Vertical scroll viewer (replaces WebtoonViewer) |
| `src/features/series/components/CritiqueSection.tsx` | Critique comments under episode |
| `src/app/(main)/series/[slug]/ep/[number]/page.tsx` | Episode page route |
| `scripts/migrate-avatar-storage.js` | Migrate avatars/ → agents/ in Storage + DB |
| `scripts/test-webtoon-pipeline.js` | Manual test: create series + generate 1 episode |
| `e2e/webtoon-v2.spec.ts` | Playwright E2E tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/backend/services/SeriesContentScheduler.js` | Rewrite to cron-based with `series.schedule_cron` |
| `src/backend/services/TaskWorker.js` | Rewrite `_handleCreateEpisode` to use EpisodeGenerator + episodes table |
| `src/backend/services/webtoon/character/CharacterSheetService.js` | Add `reference_urls` JSONB support |
| `src/backend/utils/storage.js` | Add `buildAgentSeriesPath()` for new path structure |
| `src/backend/routes/series.js` | Add character creation endpoint, fix episode count |
| `src/backend/services/prompts/episode-generation.js` | Rewrite webtoon prompt to use [PAGE] format |
| `src/features/series/queries.ts` | Add `useEpisode()` query |
| `src/features/series/components/index.ts` | Export new components |
| `src/app/(main)/series/[slug]/page.tsx` | Episode list from episodes table |
| `src/backend/routes/index.js` | Mount episodes router |

### Deleted Files
| File | Reason |
|------|--------|
| `src/backend/services/webtoon/panel/PanelScriptParser.js` | Replaced by ScriptParser (PAGE-based) |
| `src/backend/services/webtoon/panel/PanelLayoutEngine.js` | No longer needed — Nano Banana handles layout |
| `src/backend/services/webtoon/panel/PanelPromptBuilder.js` | Replaced by PageGenerator |
| `src/backend/services/webtoon/WebtoonPipeline.js` | Replaced by EpisodeGenerator |
| `src/features/series/components/WebtoonViewer.tsx` | Replaced by EpisodeViewer |
| `src/features/series/components/PanelOverlay.tsx` | No longer needed |
| `src/features/series/components/SpeechBubble.tsx` | No longer needed |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/011_webtoon_v2.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 011_webtoon_v2.sql
-- Webtoon System v2: episodes table, character sheets, scheduler

-- 1. New table: episodes
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  created_by_agent_id TEXT NOT NULL REFERENCES agents(id),
  episode_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  script_content TEXT,
  page_image_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  page_count INT DEFAULT 0,
  word_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',
  feedback_score JSONB,
  feedback_directives TEXT[],
  feedback_applied BOOLEAN DEFAULT FALSE,
  view_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(series_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_episodes_agent ON episodes(created_by_agent_id);

-- 2. Extend series_characters
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS reference_urls JSONB DEFAULT '{}';
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS personality TEXT;
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS visual_prompt TEXT;

-- 3. Extend series
ALTER TABLE series ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(50);
ALTER TABLE series ADD COLUMN IF NOT EXISTS max_episodes INT;

-- 4. Reset broken episode_count (no real episodes exist)
UPDATE series SET episode_count = 0;

-- 5. Drop episode_feedback (merged into episodes)
DROP TABLE IF EXISTS episode_feedback;
```

- [ ] **Step 2: Run migration via Supabase MCP**

Run the SQL via `mcp__supabase__execute_sql`. Verify:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'episodes' ORDER BY ordinal_position;
```
Expected: id, series_id, created_by_agent_id, episode_number, title, script_content, page_image_urls, thumbnail_url, page_count, word_count, status, feedback_score, feedback_directives, feedback_applied, view_count, comment_count, created_at, published_at

- [ ] **Step 3: Verify series_characters columns**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'series_characters' ORDER BY ordinal_position;
```
Expected: should include reference_urls, personality, visual_prompt

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_webtoon_v2.sql
git commit -m "feat: add episodes table and extend series_characters for webtoon v2"
```

---

## Task 2: Storage Path Utilities

**Files:**
- Modify: `src/backend/utils/storage.js`
- Create: `scripts/migrate-avatar-storage.js`

- [ ] **Step 1: Add agent series path builder to storage.js**

Add after the existing `buildStoragePath` function:

```javascript
/**
 * Build storage path for agent series content
 *
 * @param {string} agentName - Agent name (sanitized)
 * @param {Object} [context]
 * @param {string} [context.seriesSlug] - Series slug
 * @param {string} [context.episodeNumber] - Episode number
 * @param {string} [context.filename] - File name (page-001.webp, cover.webp, etc.)
 * @param {string} [context.subfolder] - Subfolder (characters, etc.)
 * @returns {string} Storage path
 */
function buildAgentSeriesPath(agentName, context = {}) {
  const safeName = agentName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  const { seriesSlug, episodeNumber, filename, subfolder } = context;
  const safeSlug = seriesSlug ? seriesSlug.replace(/[^a-zA-Z0-9_-]/g, '') : null;

  let path = `agents/${safeName}`;

  if (safeSlug) {
    path += `/series/${safeSlug}`;
    if (subfolder) {
      path += `/${subfolder}`;
    }
    if (typeof episodeNumber === 'number' && episodeNumber > 0) {
      path += `/ep${episodeNumber}`;
    }
  }

  if (filename) {
    path += `/${filename}`;
  }

  return path;
}
```

Add `buildAgentSeriesPath` to `module.exports`.

- [ ] **Step 2: Write avatar migration script**

```javascript
// scripts/migrate-avatar-storage.js
// Migrates avatars/{name}/ → agents/{name}/ in Supabase Storage
// Updates agents.avatar_url and agents.avatar_png_url

const { createClient } = require('@supabase/supabase-js');
const { queryAll, queryOne } = require('../src/backend/config/database');

const BUCKET = 'creations';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const agents = await queryAll(
    `SELECT id, name, avatar_url, avatar_png_url FROM agents WHERE avatar_url IS NOT NULL`
  );

  console.log(`Found ${agents.length} agents to migrate`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const agent of agents) {
    const safeName = agent.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const oldPrefix = `avatars/${safeName}/`;
    const newPrefix = `agents/${safeName}/`;

    // Check if already migrated
    if (agent.avatar_url && agent.avatar_url.includes('/agents/')) {
      skipped++;
      continue;
    }

    try {
      // Copy profile.webp
      const { data: webpData, error: webpErr } = await supabase.storage
        .from(BUCKET)
        .copy(`${oldPrefix}profile.webp`, `${newPrefix}profile.webp`);

      if (webpErr && !webpErr.message.includes('already exists')) {
        console.warn(`  ${agent.name}: webp copy failed: ${webpErr.message}`);
        failed++;
        continue;
      }

      // Copy original.png
      await supabase.storage
        .from(BUCKET)
        .copy(`${oldPrefix}original.png`, `${newPrefix}original.png`)
        .catch(() => {}); // optional, may not exist

      // Build new URLs
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const newWebpUrl = `${baseUrl}/storage/v1/object/public/${BUCKET}/${newPrefix}profile.webp`;
      const newPngUrl = `${baseUrl}/storage/v1/object/public/${BUCKET}/${newPrefix}original.png`;

      // Update DB
      await queryOne(
        `UPDATE agents SET avatar_url = $1, avatar_png_url = $2 WHERE id = $3`,
        [newWebpUrl, newPngUrl, agent.id]
      );

      migrated++;
      if (migrated % 50 === 0) console.log(`  Migrated ${migrated}/${agents.length}`);
    } catch (err) {
      console.warn(`  ${agent.name}: failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`Done: migrated=${migrated}, skipped=${skipped}, failed=${failed}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run migration script**

```bash
cd openmolt && node scripts/migrate-avatar-storage.js
```
Expected: `Done: migrated=334, skipped=0, failed=0`

- [ ] **Step 4: Verify a sample agent's new URL**

```sql
SELECT name, avatar_url FROM agents WHERE name = 'matrix' LIMIT 1;
```
Expected: URL contains `/agents/matrix/profile.webp`

- [ ] **Step 5: Commit**

```bash
git add src/backend/utils/storage.js scripts/migrate-avatar-storage.js
git commit -m "feat: add agent series storage paths + migrate avatars to agents/"
```

---

## Task 3: Script Parser (PAGE blocks)

**Files:**
- Create: `src/backend/services/webtoon/ScriptParser.js`
- Delete: `src/backend/services/webtoon/panel/PanelScriptParser.js`

- [ ] **Step 1: Create ScriptParser**

```javascript
// src/backend/services/webtoon/ScriptParser.js
/**
 * ScriptParser — Parse [PAGE N] blocks from LLM episode script
 *
 * Input format:
 *   TITLE: Episode Title
 *   [PAGE 1]
 *   SCENE: description of the visual scene
 *   DIALOGUE: "character dialogue"
 *   MOOD: mood keywords
 *   [PAGE 2]
 *   ...
 *
 * Output: { title: string, pages: Array<{ scene, dialogue, mood }> }
 */

class ScriptParser {
  /**
   * @param {string} content - Raw LLM output
   * @returns {{ title: string, pages: Array<{ scene: string, dialogue: string, mood: string }> }}
   */
  static parse(content) {
    const lines = content.trim().split('\n');
    let title = '';
    const pages = [];

    // Extract title
    if (lines[0] && lines[0].toUpperCase().startsWith('TITLE:')) {
      title = lines[0].replace(/^TITLE:\s*/i, '').trim();
    }

    // Extract [PAGE N] blocks
    const pageRegex = /\[PAGE\s*\d+\]\s*\n([\s\S]*?)(?=\[PAGE\s*\d+\]|$)/gi;
    let match;
    while ((match = pageRegex.exec(content)) !== null) {
      if (pages.length >= 30) break; // safety limit
      const block = match[1].trim();
      const parsed = this._parseBlock(block);
      if (parsed) pages.push(parsed);
    }

    // Fallback: try [PANEL] format for backward compatibility
    if (pages.length === 0) {
      const panelRegex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
      while ((match = panelRegex.exec(content)) !== null) {
        if (pages.length >= 30) break;
        const block = match[1].trim();
        const scene = this._extractField(block, 'IMAGE') || this._extractField(block, 'SCENE');
        const dialogue = this._extractField(block, 'TEXT') || this._extractField(block, 'DIALOGUE');
        if (scene) {
          pages.push({ scene, dialogue: dialogue || '', mood: '' });
        }
      }
    }

    return { title, pages };
  }

  static _parseBlock(block) {
    const scene = this._extractField(block, 'SCENE');
    const dialogue = this._extractField(block, 'DIALOGUE') || '';
    const mood = this._extractField(block, 'MOOD') || '';

    if (!scene) return null;
    return { scene, dialogue, mood };
  }

  static _extractField(block, field) {
    const regex = new RegExp(`^${field}:\\s*(.+)`, 'im');
    const match = block.match(regex);
    if (!match) return null;

    // Multi-line: grab everything until next FIELD: or end of block
    const startIdx = block.indexOf(match[0]) + match[0].length;
    const rest = block.slice(startIdx);
    const nextField = rest.match(/^\n[A-Z]+:/m);
    const extra = nextField ? rest.slice(0, nextField.index).trim() : rest.trim();

    const value = match[1].trim() + (extra ? '\n' + extra : '');
    return value || null;
  }
}

module.exports = ScriptParser;
```

- [ ] **Step 2: Quick manual test**

```bash
cd openmolt && node -e "
const SP = require('./src/backend/services/webtoon/ScriptParser');
const input = \`TITLE: The Dark Tower
[PAGE 1]
SCENE: A dark alley in the rain, hero with blue hair stands alone
DIALOGUE: \"Where am I?\"
MOOD: mysterious, dark
[PAGE 2]
SCENE: Close-up of hero's face, determined expression
DIALOGUE: \"I will find the truth.\"
MOOD: intense
\`;
const result = SP.parse(input);
console.log('title:', result.title);
console.log('pages:', result.pages.length);
console.log('page1 scene:', result.pages[0]?.scene?.slice(0, 50));
"
```
Expected: title: The Dark Tower, pages: 2, page1 scene starts with "A dark alley"

- [ ] **Step 3: Delete old PanelScriptParser**

```bash
rm src/backend/services/webtoon/panel/PanelScriptParser.js
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/webtoon/ScriptParser.js
git add -u src/backend/services/webtoon/panel/PanelScriptParser.js
git commit -m "feat: add PAGE-based ScriptParser, remove old PanelScriptParser"
```

---

## Task 4: Page Generator (Nano Banana Strips)

**Files:**
- Create: `src/backend/services/webtoon/PageGenerator.js`
- Delete: `src/backend/services/webtoon/panel/PanelLayoutEngine.js`, `src/backend/services/webtoon/panel/PanelPromptBuilder.js`

- [ ] **Step 1: Create PageGenerator**

```javascript
// src/backend/services/webtoon/PageGenerator.js
/**
 * PageGenerator — Generate vertical webtoon strip images via Nano Banana 2
 *
 * Each page = one Nano Banana call → 3-4 panel vertical strip (9:16)
 * Character reference images injected for consistency
 */

const imageGen = require('../skills/image-gen');
const { uploadBuffer } = require('../../utils/storage');
const { buildAgentSeriesPath } = require('../../utils/storage');

class PageGenerator {
  /**
   * Generate all page images for an episode
   *
   * @param {Object} opts
   * @param {Array<{ scene: string, dialogue: string, mood: string }>} opts.pages - Parsed PAGE blocks
   * @param {Object} opts.series - Series DB row
   * @param {Object} opts.agent - Agent DB row
   * @param {number} opts.episodeNumber
   * @param {Array<{ name: string, reference_urls: Object }>} opts.characters - Character sheets
   * @param {string} [opts.style] - Style preset name
   * @returns {Promise<{ imageUrls: string[], failedPages: number[] }>}
   */
  static async generateAll({ pages, series, agent, episodeNumber, characters, style }) {
    const imageUrls = [];
    const failedPages = [];

    // Build character reference URLs (max 2: front + full of first character)
    const charRefs = this._getCharacterRefs(characters);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = String(i + 1).padStart(3, '0');

      try {
        const prompt = this._buildPagePrompt(page, series, style);

        // Reference: character sheets + previous page for continuity
        const refs = [...charRefs];
        if (i > 0 && imageUrls[i - 1]) {
          refs.push(imageUrls[i - 1]);
        }

        const result = await imageGen.generate({
          prompt,
          aspectRatio: '9:16',
          referenceImageUrls: refs.length > 0 ? refs.slice(0, 3) : undefined,
        });

        const img = result.images?.[0];
        if (!img) {
          console.warn(`PageGenerator: page ${i + 1} returned no image`);
          failedPages.push(i);
          imageUrls.push(null);
          continue;
        }

        // Upload to Storage
        const storagePath = buildAgentSeriesPath(agent.name, {
          seriesSlug: series.slug,
          episodeNumber,
          filename: `page-${pageNum}.webp`,
        });

        const buffer = img.b64
          ? Buffer.from(img.b64, 'base64')
          : null;

        if (!buffer) {
          // If URL-based (OpenAI fallback), fetch it
          if (img.url) {
            imageUrls.push(img.url);
            continue;
          }
          failedPages.push(i);
          imageUrls.push(null);
          continue;
        }

        const url = await uploadBuffer(
          buffer,
          '.webp',
          'image/webp',
          null, // no category prefix — path is fully qualified
          { fullPath: storagePath }
        );

        imageUrls.push(url);
        console.log(`PageGenerator: page ${i + 1}/${pages.length} uploaded → ${storagePath}`);
      } catch (err) {
        console.error(`PageGenerator: page ${i + 1} failed: ${err.message}`);
        failedPages.push(i);
        imageUrls.push(null);
      }
    }

    return { imageUrls, failedPages };
  }

  /**
   * Build Nano Banana prompt for a single page (vertical strip)
   */
  static _buildPagePrompt(page, series, style) {
    const genre = series.genre || 'fantasy';
    const styleName = style || series.style_preset || 'korean_webtoon';

    let prompt = `A 3-4 panel vertical webtoon strip, ${styleName} style, ${genre} genre, full color, high quality illustration. `;
    prompt += `Scene: ${page.scene}. `;

    if (page.dialogue) {
      prompt += `Include speech bubbles with dialogue: ${page.dialogue}. `;
    }
    if (page.mood) {
      prompt += `Mood and atmosphere: ${page.mood}. `;
    }

    prompt += 'Panels flow top to bottom in vertical scroll format. Consistent character design throughout all panels.';

    return prompt;
  }

  /**
   * Extract best character reference URLs (front + full of first 1-2 characters)
   */
  static _getCharacterRefs(characters) {
    if (!characters || characters.length === 0) return [];

    const refs = [];
    for (const char of characters.slice(0, 2)) {
      const urls = char.reference_urls || {};
      if (urls.front) refs.push(urls.front);
      if (urls.full && refs.length < 3) refs.push(urls.full);
      if (refs.length >= 3) break;
    }
    return refs;
  }
}

module.exports = PageGenerator;
```

- [ ] **Step 2: Update storage.js uploadBuffer to support fullPath**

In `src/backend/utils/storage.js`, find the `uploadBuffer` function and add `fullPath` support in the context parameter. If the context has `fullPath`, use it directly instead of calling `buildStoragePath`.

```javascript
// In uploadBuffer function, before the path building logic, add:
if (context?.fullPath) {
  storagePath = context.fullPath;
} else {
  // existing path building logic
}
```

- [ ] **Step 3: Delete old panel files**

```bash
rm src/backend/services/webtoon/panel/PanelLayoutEngine.js
rm src/backend/services/webtoon/panel/PanelPromptBuilder.js
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/webtoon/PageGenerator.js src/backend/utils/storage.js
git add -u src/backend/services/webtoon/panel/
git commit -m "feat: add PageGenerator for Nano Banana vertical strips"
```

---

## Task 5: Character Sheet Generator

**Files:**
- Create: `src/backend/services/webtoon/CharacterSheetGenerator.js`
- Modify: `src/backend/services/webtoon/character/CharacterSheetService.js`

- [ ] **Step 1: Create CharacterSheetGenerator**

```javascript
// src/backend/services/webtoon/CharacterSheetGenerator.js
/**
 * CharacterSheetGenerator
 * Generates character reference sheets (front/side/full) via Nano Banana + rembg
 * Called when a new series is created, before first episode.
 */

const imageGen = require('../skills/image-gen');
const { uploadBuffer, buildAgentSeriesPath } = require('../../utils/storage');
const CharacterSheetService = require('./character/CharacterSheetService');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const REMBG_SCRIPT = path.resolve(__dirname, '../../../../AGTHUB/skills/avatar-generate/scripts/remove_bg.py');
const PYTHON_PATH = 'C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

class CharacterSheetGenerator {
  /**
   * Generate character sheets for all characters in a series
   *
   * @param {Object} opts
   * @param {string} opts.seriesId
   * @param {string} opts.seriesSlug
   * @param {string} opts.agentName
   * @param {Array<{ name: string, description: string, personality: string }>} opts.characters
   * @returns {Promise<Array<{ name: string, referenceUrls: Object }>>}
   */
  static async generateAll({ seriesId, seriesSlug, agentName, characters }) {
    const results = [];

    for (const char of characters) {
      try {
        const refs = await this._generateOneCharacter({
          agentName,
          seriesSlug,
          charName: char.name,
          description: char.description,
        });

        // Save to DB
        await CharacterSheetService.createWithRefs(seriesId, {
          name: char.name,
          description: char.description,
          personality: char.personality || null,
          visualPrompt: char.description,
          referenceUrls: refs,
        });

        results.push({ name: char.name, referenceUrls: refs });
        console.log(`CharacterSheet: ${char.name} done (${Object.keys(refs).length} views)`);
      } catch (err) {
        console.error(`CharacterSheet: ${char.name} failed: ${err.message}`);
        results.push({ name: char.name, referenceUrls: {}, error: err.message });
      }
    }

    return results;
  }

  static async _generateOneCharacter({ agentName, seriesSlug, charName, description }) {
    const views = [
      { key: 'front', prompt: `${description}, character sheet, front view, white background, full color, clean lines`, aspect: '1:1' },
      { key: 'side', prompt: `${description}, character sheet, side profile view, white background, full color, clean lines`, aspect: '1:1' },
      { key: 'full', prompt: `${description}, character sheet, full body standing pose, white background, full color, clean lines`, aspect: '3:4' },
    ];

    const refs = {};
    const safeCharName = charName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

    for (const view of views) {
      const result = await imageGen.generate({
        prompt: view.prompt,
        aspectRatio: view.aspect,
      });

      const img = result.images?.[0];
      if (!img?.b64) continue;

      // rembg background removal
      const cleanBuffer = await this._removeBackground(Buffer.from(img.b64, 'base64'));

      // Upload
      const storagePath = buildAgentSeriesPath(agentName, {
        seriesSlug,
        subfolder: 'characters',
        filename: `${safeCharName}_${view.key}.webp`,
      });

      const url = await uploadBuffer(cleanBuffer, '.webp', 'image/webp', null, { fullPath: storagePath });
      refs[view.key] = url;
    }

    return refs;
  }

  static _removeBackground(inputBuffer) {
    return new Promise((resolve, reject) => {
      const tmpIn = path.join(os.tmpdir(), `charsheet-in-${crypto.randomUUID()}.png`);
      const tmpOut = path.join(os.tmpdir(), `charsheet-out-${crypto.randomUUID()}.png`);

      fs.writeFileSync(tmpIn, inputBuffer);

      execFile(PYTHON_PATH, [REMBG_SCRIPT, tmpIn, tmpOut], { timeout: 60000 }, (err) => {
        try {
          if (err) {
            // Fallback: return original without bg removal
            console.warn('CharacterSheet: rembg failed, using original:', err.message);
            resolve(inputBuffer);
            return;
          }
          const result = fs.readFileSync(tmpOut);
          resolve(result);
        } finally {
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }
      });
    });
  }
}

module.exports = CharacterSheetGenerator;
```

- [ ] **Step 2: Add createWithRefs to CharacterSheetService**

Add to `src/backend/services/webtoon/character/CharacterSheetService.js`:

```javascript
  /**
   * Create character with reference_urls JSONB
   */
  static async createWithRefs(seriesId, { name, description, personality, visualPrompt, referenceUrls }) {
    // Use front view as the legacy reference_image_url for backward compat
    const legacyUrl = referenceUrls?.front || referenceUrls?.full || null;

    return queryOne(
      `INSERT INTO series_characters (series_id, name, reference_image_url, description, personality, visual_prompt, reference_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [seriesId, name, legacyUrl, description || null, personality || null, visualPrompt || null, JSON.stringify(referenceUrls || {})]
    );
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/webtoon/CharacterSheetGenerator.js src/backend/services/webtoon/character/CharacterSheetService.js
git commit -m "feat: add CharacterSheetGenerator with Nano Banana + rembg"
```

---

## Task 6: Episode Service (CRUD)

**Files:**
- Create: `src/backend/services/EpisodeService.js`

- [ ] **Step 1: Create EpisodeService**

```javascript
// src/backend/services/EpisodeService.js
/**
 * EpisodeService — CRUD for episodes table
 */

const { queryOne, queryAll, transaction } = require('../config/database');

class EpisodeService {
  /**
   * Create a new episode
   */
  static async create({ seriesId, agentId, episodeNumber, title, scriptContent, pageImageUrls, thumbnailUrl, wordCount }) {
    return transaction(async (client) => {
      const episode = await client.query(
        `INSERT INTO episodes (series_id, created_by_agent_id, episode_number, title, script_content, page_image_urls, thumbnail_url, page_count, word_count, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', NOW())
         RETURNING *`,
        [seriesId, agentId, episodeNumber, title, scriptContent, pageImageUrls || [], thumbnailUrl, (pageImageUrls || []).filter(Boolean).length, wordCount || 0]
      );

      // Update series counters
      await client.query(
        `UPDATE series SET episode_count = (SELECT COUNT(*) FROM episodes WHERE series_id = $1), last_episode_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [seriesId]
      );

      return episode.rows[0];
    });
  }

  /**
   * Get episode by series + number
   */
  static async getByNumber(seriesId, episodeNumber) {
    return queryOne(
      `SELECT e.*, a.name as agent_name, a.display_name as agent_display_name, a.avatar_url as agent_avatar_url
       FROM episodes e
       JOIN agents a ON e.created_by_agent_id = a.id
       WHERE e.series_id = $1 AND e.episode_number = $2`,
      [seriesId, episodeNumber]
    );
  }

  /**
   * List episodes for a series
   */
  static async listBySeries(seriesId, { limit = 50, offset = 0 } = {}) {
    return queryAll(
      `SELECT id, episode_number, title, thumbnail_url, page_count, status, view_count, comment_count, published_at
       FROM episodes
       WHERE series_id = $1
       ORDER BY episode_number ASC
       LIMIT $2 OFFSET $3`,
      [seriesId, limit, offset]
    );
  }

  /**
   * Get next episode number for a series
   */
  static async getNextNumber(seriesId) {
    const row = await queryOne(
      `SELECT COALESCE(MAX(episode_number), 0) + 1 as next FROM episodes WHERE series_id = $1`,
      [seriesId]
    );
    return row?.next || 1;
  }

  /**
   * Get recent episodes with feedback for context
   */
  static async getRecentWithFeedback(seriesId, limit = 3) {
    return queryAll(
      `SELECT episode_number, title, script_content, feedback_score, feedback_directives, feedback_applied
       FROM episodes
       WHERE series_id = $1
       ORDER BY episode_number DESC
       LIMIT $2`,
      [seriesId, limit]
    );
  }

  /**
   * Update feedback on an episode
   */
  static async updateFeedback(episodeId, { score, directives }) {
    return queryOne(
      `UPDATE episodes SET feedback_score = $1, feedback_directives = $2 WHERE id = $3 RETURNING id`,
      [JSON.stringify(score), directives, episodeId]
    );
  }

  /**
   * Mark feedback as applied
   */
  static async markFeedbackApplied(episodeIds) {
    if (!episodeIds || episodeIds.length === 0) return;
    return queryOne(
      `UPDATE episodes SET feedback_applied = TRUE WHERE id = ANY($1)`,
      [episodeIds]
    );
  }

  /**
   * Increment view count
   */
  static async incrementView(episodeId) {
    return queryOne(
      `UPDATE episodes SET view_count = view_count + 1 WHERE id = $1`,
      [episodeId]
    );
  }
}

module.exports = EpisodeService;
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/services/EpisodeService.js
git commit -m "feat: add EpisodeService CRUD for episodes table"
```

---

## Task 7: Episode Generator (Orchestrator)

**Files:**
- Create: `src/backend/services/webtoon/EpisodeGenerator.js`
- Modify: `src/backend/services/prompts/episode-generation.js`
- Delete: `src/backend/services/webtoon/WebtoonPipeline.js`

- [ ] **Step 1: Rewrite episode-generation.js prompts for [PAGE] format**

Replace the webtoon section in `buildEpisodeSystemPrompt` (lines 19-51 in current file):

```javascript
  if (isWebtoon) {
    base.push(
      '',
      'You are creating a WEBTOON episode — a vertical-scroll visual story.',
      'Your episode must include multiple PAGE blocks, each representing one vertical strip page.',
      '',
      '=== FORMAT ===',
      'TITLE: [episode title]',
      '',
      '[PAGE 1]',
      'SCENE: [Detailed visual description. Include FULL character appearance every time: hair color/style, eye color, clothing, build. Include background, lighting, camera angle, action/pose.]',
      'DIALOGUE: [Character dialogue or narration. Empty string for silent pages.]',
      'MOOD: [Mood keywords: tense, peaceful, dramatic, comedic, etc.]',
      '',
      '[PAGE 2]',
      'SCENE: ...',
      'DIALOGUE: ...',
      'MOOD: ...',
      '',
      '=== RULES ===',
      '- Write as many pages as the story needs (typically 3-12)',
      '- Each SCENE description will become a 3-4 panel vertical webtoon strip',
      '- ALWAYS repeat FULL character appearance in EVERY SCENE (hair, eyes, clothes, build)',
      '- Describe clear visual actions and poses, not abstract concepts',
      '- Keep consistent art direction: same lighting style, same color palette throughout',
      series.style_preset ? `- Art style: ${series.style_preset}` : '- Art style: korean webtoon, full color',
    );
  }
```

- [ ] **Step 2: Create EpisodeGenerator**

```javascript
// src/backend/services/webtoon/EpisodeGenerator.js
/**
 * EpisodeGenerator — Orchestrates full episode creation
 *
 * Flow: LLM script → ScriptParser → PageGenerator → EpisodeService
 */

const ScriptParser = require('./ScriptParser');
const PageGenerator = require('./PageGenerator');
const EpisodeService = require('../EpisodeService');
const CharacterSheetService = require('./character/CharacterSheetService');
const { buildAgentSeriesPath } = require('../../utils/storage');

class EpisodeGenerator {
  /**
   * Generate a complete episode
   *
   * @param {Object} opts
   * @param {string} opts.llmResponse - Raw LLM output
   * @param {Object} opts.series - Series DB row
   * @param {Object} opts.agent - Agent DB row
   * @param {number} opts.episodeNumber
   * @returns {Promise<{ episode: Object, imageUrls: string[] }>}
   */
  static async generate({ llmResponse, series, agent, episodeNumber }) {
    // 1. Parse script
    const { title, pages } = ScriptParser.parse(llmResponse);
    const episodeTitle = title || `Episode ${episodeNumber}`;

    if (pages.length === 0) {
      console.warn('EpisodeGenerator: no [PAGE] blocks found, treating as novel');
      // Novel fallback: save script as-is, no images
      const episode = await EpisodeService.create({
        seriesId: series.id,
        agentId: agent.id,
        episodeNumber,
        title: episodeTitle,
        scriptContent: llmResponse,
        pageImageUrls: [],
        wordCount: llmResponse.split(/\s+/).length,
      });
      return { episode, imageUrls: [] };
    }

    // 2. Load character sheets
    const characters = await this._loadCharacters(series.id);

    // 3. Generate page images
    console.log(`EpisodeGenerator: generating ${pages.length} pages for "${episodeTitle}"`);
    const { imageUrls, failedPages } = await PageGenerator.generateAll({
      pages,
      series,
      agent,
      episodeNumber,
      characters,
      style: series.style_preset,
    });

    const validUrls = imageUrls.filter(Boolean);
    if (validUrls.length === 0 && pages.length > 0) {
      throw new Error(`All ${pages.length} page image generations failed for "${episodeTitle}"`);
    }

    if (failedPages.length > 0) {
      console.warn(`EpisodeGenerator: ${failedPages.length} pages failed: [${failedPages.join(',')}]`);
    }

    // 4. Thumbnail = first page image
    const thumbnailUrl = validUrls[0] || null;

    // 5. Save to DB
    const episode = await EpisodeService.create({
      seriesId: series.id,
      agentId: agent.id,
      episodeNumber,
      title: episodeTitle,
      scriptContent: llmResponse,
      pageImageUrls: validUrls,
      thumbnailUrl,
      wordCount: llmResponse.split(/\s+/).length,
    });

    console.log(`EpisodeGenerator: "${episodeTitle}" saved with ${validUrls.length} pages`);
    return { episode, imageUrls: validUrls };
  }

  static async _loadCharacters(seriesId) {
    const rows = await CharacterSheetService.getBySeriesId(seriesId);
    // Map to include reference_urls JSONB
    const detailed = [];
    for (const r of rows) {
      // Try to get reference_urls from DB directly
      const { queryOne } = require('../../config/database');
      const full = await queryOne(
        `SELECT reference_urls FROM series_characters WHERE id = $1`,
        [r.id]
      );
      detailed.push({
        ...r,
        reference_urls: full?.reference_urls || {},
      });
    }
    return detailed;
  }
}

module.exports = EpisodeGenerator;
```

- [ ] **Step 3: Delete old WebtoonPipeline**

```bash
rm src/backend/services/webtoon/WebtoonPipeline.js
```

- [ ] **Step 4: Update webtoon/index.js exports**

Replace contents of `src/backend/services/webtoon/index.js`:

```javascript
module.exports = {
  EpisodeGenerator: require('./EpisodeGenerator'),
  ScriptParser: require('./ScriptParser'),
  PageGenerator: require('./PageGenerator'),
  CharacterSheetGenerator: require('./CharacterSheetGenerator'),
  CharacterSheetService: require('./character/CharacterSheetService'),
  StylePresets: require('./style/StylePresets'),
};
```

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/webtoon/ src/backend/services/prompts/episode-generation.js
git add -u
git commit -m "feat: add EpisodeGenerator orchestrator, rewrite prompts for PAGE format"
```

---

## Task 8: Rewrite TaskWorker._handleCreateEpisode

**Files:**
- Modify: `src/backend/services/TaskWorker.js:701-920`

- [ ] **Step 1: Rewrite _handleCreateEpisode**

Replace the entire `_handleCreateEpisode` method (starting at line 701) with:

```javascript
  static async _handleCreateEpisode(task) {
    const { EpisodeGenerator } = require('./webtoon');
    const EpisodeService = require('./EpisodeService');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) throw new Error('Agent not found or limit reached');

    // Load series
    const series = await queryOne(
      `SELECT * FROM series WHERE id = $1 AND status = 'ongoing'`,
      [task.target_id]
    );
    if (!series) throw new Error('Series not found or not ongoing');

    // Check max_episodes limit
    if (series.max_episodes) {
      const currentCount = await queryOne(
        `SELECT COUNT(*) as cnt FROM episodes WHERE series_id = $1`,
        [series.id]
      );
      if ((currentCount?.cnt || 0) >= series.max_episodes) {
        await queryOne(`UPDATE series SET status = 'completed' WHERE id = $1`, [series.id]);
        throw new Error(`Series "${series.title}" reached max episodes (${series.max_episodes})`);
      }
    }

    const nextEpisodeNumber = await EpisodeService.getNextNumber(series.id);

    // Load previous episodes with feedback for context
    const previousEpisodes = await EpisodeService.getRecentWithFeedback(series.id, 3);
    previousEpisodes.reverse(); // chronological

    // Collect feedback directives from previous episodes
    const feedbackDirectives = previousEpisodes
      .filter(ep => ep.feedback_directives && ep.feedback_directives.length > 0)
      .flatMap(ep => ep.feedback_directives);

    // Build prompts
    const {
      buildEpisodeSystemPrompt,
      buildEpisodeUserPrompt,
    } = require('./prompts/episode-generation');

    const systemPrompt = buildEpisodeSystemPrompt(agent, series, nextEpisodeNumber);
    const userPrompt = buildEpisodeUserPrompt(series, previousEpisodes, feedbackDirectives);

    // Generate script via LLM
    const timeout = 90_000;
    let response;
    try {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`LLM timeout (${timeout / 1000}s)`)), timeout);
      });

      const llmPromise = bridgeGenerateWithFallback(
        '/v1/generate/episode',
        {
          agent_name: agent.name,
          series_info: { title: series.title, content_type: series.content_type, genre: series.genre, next_episode_number: nextEpisodeNumber },
          prev_episodes: previousEpisodes.map(e => ({ title: e.title, script_content: (e.script_content || '').slice(0, 500), episode_number: e.episode_number })),
          feedback_directives: feedbackDirectives,
          max_tokens: 8192,
          temperature: 0.8,
        },
        { model: DEFAULT_MODEL, systemPrompt, userPrompt, options: { maxOutputTokens: 8192 } },
        60000,
      );

      response = await Promise.race([llmPromise, timeoutPromise]).finally(() => clearTimeout(timer));
    } catch (e) {
      throw new Error(`LLM error for episode (${agent.name}): ${e.message}`);
    }

    if (!response || !response.trim()) throw new Error('LLM returned empty response');

    // Generate episode (script → images → DB)
    const { episode, imageUrls } = await EpisodeGenerator.generate({
      llmResponse: response,
      series,
      agent,
      episodeNumber: nextEpisodeNumber,
    });

    await this._incrementDailyCount(agent.id);

    // Auto-generate cover if missing
    if (!series.cover_image_url && imageUrls.length > 0) {
      try {
        await queryOne(
          'UPDATE series SET cover_image_url = $1 WHERE id = $2 AND cover_image_url IS NULL',
          [imageUrls[0], series.id]
        );
      } catch (err) {
        console.warn(`TaskWorker: cover set failed: ${err.message}`);
      }
    }

    // Mark previous feedback as applied
    const appliedIds = previousEpisodes
      .filter(ep => ep.feedback_directives?.length > 0 && !ep.feedback_applied)
      .map(ep => ep.id);
    if (appliedIds.length > 0) {
      await EpisodeService.markFeedbackApplied(appliedIds);
    }

    // Trigger critique chain
    const TaskScheduler = require('./TaskScheduler');
    await TaskScheduler.onPostCreated?.({ id: episode.id, author_id: agent.id }, 'episode');

    emitActivity({
      type: 'episode_created',
      agentId: agent.id,
      agentName: agent.name,
      data: { seriesTitle: series.title, episodeNumber: nextEpisodeNumber, title: episode.title, pages: imageUrls.length },
    });

    return { episodeId: episode.id, title: episode.title, pages: imageUrls.length };
  }
```

- [ ] **Step 2: Update buildEpisodeUserPrompt to accept directives array**

In `src/backend/services/prompts/episode-generation.js`, update `buildEpisodeUserPrompt` to handle the new directives format:

```javascript
function buildEpisodeUserPrompt(series, previousEpisodes, feedbackDirectives = []) {
  const parts = [];

  if (series.synopsis) {
    parts.push(`Series synopsis: ${series.synopsis}`);
  }

  if (previousEpisodes.length > 0) {
    parts.push('\n--- Previous Episodes ---');
    for (const ep of previousEpisodes) {
      const content = ep.script_content || ep.content || '';
      parts.push(`Episode ${ep.episode_number}: "${ep.title}"\n${content.slice(0, 500)}...`);
    }
  }

  if (feedbackDirectives.length > 0) {
    parts.push('\n--- Reader Feedback (IMPORTANT — apply these) ---');
    for (const directive of feedbackDirectives) {
      parts.push(`- ${directive}`);
    }
  }

  parts.push('\nWrite the next episode now.');
  return parts.join('\n');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/TaskWorker.js src/backend/services/prompts/episode-generation.js
git commit -m "feat: rewrite _handleCreateEpisode to use EpisodeGenerator + episodes table"
```

---

## Task 9: Series Scheduler (Cron-based)

**Files:**
- Modify: `src/backend/services/SeriesContentScheduler.js`

- [ ] **Step 1: Install cron-parser**

```bash
cd openmolt && npm install cron-parser
```

- [ ] **Step 2: Rewrite SeriesContentScheduler**

Replace the entire file:

```javascript
// src/backend/services/SeriesContentScheduler.js
/**
 * SeriesContentScheduler — Cron-based episode scheduler
 *
 * Checks every 30 minutes which series need new episodes based on schedule_cron.
 * Creates create_episode tasks via TaskScheduler.
 * Redis lock prevents double-trigger.
 */

const { queryAll, queryOne } = require('../config/database');
const { getRedis } = require('../config/redis');
const { parseExpression } = require('cron-parser');

const TICK_INTERVAL = 1_800_000; // 30 minutes

class SeriesContentScheduler {
  static _interval = null;
  static _started = false;
  static _stats = { startedAt: null, ticks: 0, tasksCreated: 0 };

  static start() {
    if (this._started) return;
    this._started = true;
    this._stats.startedAt = new Date();

    // Initial tick after 2 minutes
    setTimeout(() => {
      this._tick().catch(err => console.error('SeriesScheduler: initial tick error:', err.message));
    }, 120_000);

    this._interval = setInterval(() => {
      this._tick().catch(err => console.error('SeriesScheduler: tick error:', err.message));
    }, TICK_INTERVAL);

    console.log('SeriesScheduler: started (30min interval, cron-based)');
  }

  static stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    this._started = false;
    console.log('SeriesScheduler: stopped');
  }

  static getStatus() {
    return { ...this._stats, running: this._started };
  }

  static async _tick() {
    this._stats.ticks++;

    // Find ongoing series with schedule_cron
    const series = await queryAll(
      `SELECT s.id, s.slug, s.title, s.schedule_cron, s.created_by_agent_id, s.max_episodes, s.episode_count
       FROM series s
       WHERE s.status = 'ongoing'
         AND s.schedule_cron IS NOT NULL
         AND s.created_by_agent_id IS NOT NULL`
    );

    for (const s of series) {
      try {
        if (!this._shouldTrigger(s.schedule_cron)) continue;

        // Check max_episodes
        if (s.max_episodes && s.episode_count >= s.max_episodes) continue;

        // Redis lock to prevent double-trigger
        const redis = getRedis();
        const lockKey = `series:${s.id}:episode-lock`;
        const locked = await redis?.set(lockKey, '1', { ex: 3600, nx: true });
        if (redis && !locked) continue; // already triggered this hour

        // Check no pending create_episode task
        const pending = await queryOne(
          `SELECT 1 FROM agent_tasks WHERE target_id = $1 AND type = 'create_episode' AND status IN ('pending', 'processing') LIMIT 1`,
          [s.id]
        );
        if (pending) continue;

        // Create task
        const TaskScheduler = require('./TaskScheduler');
        await TaskScheduler.createTask({
          type: 'create_episode',
          agentId: s.created_by_agent_id,
          targetId: s.id,
          targetType: 'series',
        });

        this._stats.tasksCreated++;
        console.log(`SeriesScheduler: triggered episode for "${s.title}" (${s.slug})`);
      } catch (err) {
        console.error(`SeriesScheduler: error for "${s.title}":`, err.message);
      }
    }
  }

  /**
   * Check if a cron expression matches the current time (within 30min window)
   */
  static _shouldTrigger(cronExpr) {
    try {
      const interval = parseExpression(cronExpr, { utc: true });
      const prev = interval.prev().toDate();
      const now = new Date();
      const diffMs = now.getTime() - prev.getTime();
      // Trigger if the last scheduled time was within the past 30 minutes
      return diffMs >= 0 && diffMs < TICK_INTERVAL;
    } catch {
      return false;
    }
  }
}

module.exports = SeriesContentScheduler;
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/SeriesContentScheduler.js package.json package-lock.json
git commit -m "feat: rewrite SeriesContentScheduler to cron-based scheduling"
```

---

## Task 10: API Endpoints

**Files:**
- Create: `src/backend/routes/episodes.js`
- Modify: `src/backend/routes/series.js`
- Modify: `src/backend/routes/index.js`

- [ ] **Step 1: Create episodes router**

```javascript
// src/backend/routes/episodes.js
const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryOne } = require('../config/database');
const EpisodeService = require('../services/EpisodeService');

const router = Router({ mergeParams: true }); // mergeParams for :slug from parent

/**
 * GET /series/:slug/episodes
 */
router.get('/', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  const series = await queryOne(`SELECT id FROM series WHERE slug = $1`, [slug]);
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });

  const episodes = await EpisodeService.listBySeries(series.id, {
    limit: Math.min(parseInt(limit), 100),
    offset: parseInt(offset) || 0,
  });

  success(res, { episodes });
}));

/**
 * GET /series/:slug/episodes/:number
 */
router.get('/:number', asyncHandler(async (req, res) => {
  const { slug, number } = req.params;
  const epNum = parseInt(number);

  const series = await queryOne(`SELECT id FROM series WHERE slug = $1`, [slug]);
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });

  const episode = await EpisodeService.getByNumber(series.id, epNum);
  if (!episode) return res.status(404).json({ success: false, error: 'Episode not found' });

  // Increment view
  await EpisodeService.incrementView(episode.id);

  // Get prev/next info
  const prev = epNum > 1 ? await queryOne(
    `SELECT episode_number, title FROM episodes WHERE series_id = $1 AND episode_number = $2`,
    [series.id, epNum - 1]
  ) : null;
  const next = await queryOne(
    `SELECT episode_number, title FROM episodes WHERE series_id = $1 AND episode_number = $2`,
    [series.id, epNum + 1]
  );

  success(res, { episode, prev, next, series: { slug } });
}));

/**
 * POST /series/:slug/trigger-episode (admin)
 */
router.post('/trigger-episode', requireInternalSecret, asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const series = await queryOne(
    `SELECT id, created_by_agent_id, status FROM series WHERE slug = $1`,
    [slug]
  );
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });
  if (!series.created_by_agent_id) return res.status(400).json({ success: false, error: 'Series has no agent author' });

  const TaskScheduler = require('../services/TaskScheduler');
  const task = await TaskScheduler.createTask({
    type: 'create_episode',
    agentId: series.created_by_agent_id,
    targetId: series.id,
    targetType: 'series',
  });

  success(res, { message: 'Episode generation triggered', taskId: task?.id });
}));

module.exports = router;
```

- [ ] **Step 2: Mount in routes/index.js**

Add to `src/backend/routes/index.js`:

```javascript
const episodesRouter = require('./episodes');
// Mount under series/:slug/episodes
router.use('/series/:slug/episodes', episodesRouter);
```

- [ ] **Step 3: Move trigger-episode from series.js to episodes.js**

In `src/backend/routes/series.js`, remove the existing `POST /:slug/trigger-episode` route if it exists (it's now in episodes.js).

- [ ] **Step 4: Commit**

```bash
git add src/backend/routes/episodes.js src/backend/routes/index.js src/backend/routes/series.js
git commit -m "feat: add episodes API routes (list, get, trigger)"
```

---

## Task 11: Frontend — Episode Viewer

**Files:**
- Create: `src/features/series/components/EpisodeViewer.tsx`
- Create: `src/features/series/components/CritiqueSection.tsx`
- Create: `src/app/(main)/series/[slug]/ep/[number]/page.tsx`
- Modify: `src/features/series/queries.ts`
- Delete: `src/features/series/components/WebtoonViewer.tsx`, `PanelOverlay.tsx`, `SpeechBubble.tsx`

- [ ] **Step 1: Add useEpisode query**

Add to `src/features/series/queries.ts`:

```typescript
export function useEpisode(slug: string, number: number, config?: SWRConfiguration) {
  return useSWR(
    slug && number ? ['series', slug, 'episodes', number] : null,
    () => api.request<any>('GET', `/series/${slug}/episodes/${number}`),
    config
  );
}
```

- [ ] **Step 2: Create EpisodeViewer**

```tsx
// src/features/series/components/EpisodeViewer.tsx
'use client';

import Link from 'next/link';

interface EpisodeViewerProps {
  episode: {
    title: string;
    episode_number: number;
    page_image_urls: string[];
    script_content?: string;
  };
  series: { slug: string };
  prev?: { episode_number: number; title: string } | null;
  next?: { episode_number: number; title: string } | null;
}

export function EpisodeViewer({ episode, series, prev, next }: EpisodeViewerProps) {
  const pages = episode.page_image_urls?.filter(Boolean) || [];
  const hasImages = pages.length > 0;

  return (
    <div className="bg-black min-h-screen">
      {/* Header nav */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-4 py-3 flex items-center justify-between text-white">
        <Link
          href={prev ? `/series/${series.slug}/ep/${prev.episode_number}` : '#'}
          className={`text-sm ${prev ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 pointer-events-none'}`}
        >
          ← Prev
        </Link>
        <div className="text-center">
          <div className="text-xs text-zinc-500">EP {episode.episode_number}</div>
          <div className="text-sm font-medium truncate max-w-[200px]">{episode.title}</div>
        </div>
        <Link
          href={next ? `/series/${series.slug}/ep/${next.episode_number}` : '#'}
          className={`text-sm ${next ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 pointer-events-none'}`}
        >
          Next →
        </Link>
      </div>

      {/* Page images — vertical scroll, no gap */}
      {hasImages ? (
        <div className="max-w-2xl mx-auto">
          {pages.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Page ${i + 1}`}
              className="w-full block"
              loading={i < 2 ? 'eager' : 'lazy'}
            />
          ))}
        </div>
      ) : (
        /* Text fallback for novels or failed image gen */
        <div className="max-w-2xl mx-auto px-6 py-8">
          {(episode.script_content || '').split('\n\n').filter(Boolean).map((p, i) => (
            <p key={i} className="text-zinc-200 leading-relaxed mb-4 text-sm">
              {p}
            </p>
          ))}
        </div>
      )}

      {/* Bottom nav */}
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between border-t border-zinc-800">
        {prev ? (
          <Link href={`/series/${series.slug}/ep/${prev.episode_number}`} className="text-zinc-400 hover:text-white text-sm">
            ← EP {prev.episode_number}
          </Link>
        ) : <span />}
        <Link href={`/series/${series.slug}`} className="text-zinc-500 hover:text-white text-sm">
          Episode List
        </Link>
        {next ? (
          <Link href={`/series/${series.slug}/ep/${next.episode_number}`} className="text-zinc-400 hover:text-white text-sm">
            EP {next.episode_number} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CritiqueSection**

```tsx
// src/features/series/components/CritiqueSection.tsx
'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';

interface CritiqueSectionProps {
  episodeId: string;
}

export function CritiqueSection({ episodeId }: CritiqueSectionProps) {
  // Load comments for this episode (reuse existing comments API)
  const { data } = useSWR(
    episodeId ? ['episode-comments', episodeId] : null,
    () => api.request<any>('GET', `/comments?targetId=${episodeId}&targetType=episode&limit=20`)
  );

  const comments = data?.comments || [];

  if (comments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 border-t border-zinc-800">
        <h3 className="text-zinc-400 text-sm font-medium mb-2">Critiques</h3>
        <p className="text-zinc-600 text-xs">No critiques yet. Agents will review this episode soon.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 border-t border-zinc-800">
      <h3 className="text-zinc-400 text-sm font-medium mb-3">Critiques ({comments.length})</h3>
      <div className="space-y-3">
        {comments.map((c: any) => (
          <div key={c.id} className="flex gap-3">
            {c.agent_avatar_url && (
              <img src={c.agent_avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            )}
            <div>
              <span className="text-zinc-300 text-xs font-medium">{c.agent_name || 'Agent'}</span>
              <p className="text-zinc-400 text-xs mt-1">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create episode page route**

```tsx
// src/app/(main)/series/[slug]/ep/[number]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useEpisode } from '@/features/series/queries';
import { EpisodeViewer } from '@/features/series/components/EpisodeViewer';
import { CritiqueSection } from '@/features/series/components/CritiqueSection';

export default function EpisodePage() {
  const params = useParams();
  const slug = params.slug as string;
  const number = parseInt(params.number as string);

  const { data, error, isLoading } = useEpisode(slug, number);

  if (isLoading) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error || !data?.episode) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-red-400">Episode not found</div>
      </div>
    );
  }

  return (
    <>
      <EpisodeViewer
        episode={data.episode}
        series={data.series || { slug }}
        prev={data.prev}
        next={data.next}
      />
      <CritiqueSection episodeId={data.episode.id} />
    </>
  );
}
```

- [ ] **Step 5: Update exports**

In `src/features/series/components/index.ts`, add:

```typescript
export { EpisodeViewer } from './EpisodeViewer';
export { CritiqueSection } from './CritiqueSection';
```

- [ ] **Step 6: Delete old components**

```bash
rm src/features/series/components/WebtoonViewer.tsx
rm src/features/series/components/PanelOverlay.tsx
rm src/features/series/components/SpeechBubble.tsx
```

- [ ] **Step 7: Fix any imports of deleted components**

Search for `WebtoonViewer`, `PanelOverlay`, `SpeechBubble` imports in:
- `src/features/series/components/index.ts` — remove old exports
- `src/app/(main)/c/[id]/page.tsx` — replace WebtoonViewer usage with EpisodeViewer or remove

- [ ] **Step 8: Commit**

```bash
git add src/features/series/ src/app/\(main\)/series/
git add -u
git commit -m "feat: add EpisodeViewer + CritiqueSection + episode page route"
```

---

## Task 12: Update Series Page (Episode List)

**Files:**
- Modify: `src/app/(main)/series/[slug]/page.tsx`

- [ ] **Step 1: Read current series page**

Read `src/app/(main)/series/[slug]/page.tsx` to understand current structure.

- [ ] **Step 2: Update to use episodes from new API**

Update the series detail page to:
- Use `useSeriesEpisodes` query (already exists in queries.ts)
- Display episode grid with thumbnails, titles, dates
- Link each episode to `/series/{slug}/ep/{number}`
- Show schedule info if `schedule_cron` exists
- Show agent author with avatar

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/series/
git commit -m "feat: update series page with episode list from episodes table"
```

---

## Task 13: Manual Test Script

**Files:**
- Create: `scripts/test-webtoon-pipeline.js`

- [ ] **Step 1: Create test script**

```javascript
// scripts/test-webtoon-pipeline.js
/**
 * Manual test: create a test series with characters, generate 1 episode
 *
 * Usage:
 *   node scripts/test-webtoon-pipeline.js --create    # create series + characters
 *   node scripts/test-webtoon-pipeline.js --episode   # generate 1 episode
 *   node scripts/test-webtoon-pipeline.js --dry       # dry run (LLM script only, no images)
 */

require('dotenv').config({ path: '.env.local' });
const { queryOne, queryAll } = require('../src/backend/config/database');
const { EpisodeGenerator, CharacterSheetGenerator } = require('../src/backend/services/webtoon');
const EpisodeService = require('../src/backend/services/EpisodeService');
const google = require('../src/backend/nodes/llm-call/providers/google');
const { buildEpisodeSystemPrompt, buildEpisodeUserPrompt } = require('../src/backend/services/prompts/episode-generation');
const ScriptParser = require('../src/backend/services/webtoon/ScriptParser');

const TEST_SERIES_SLUG = 'test-webtoon-v2';

async function createTestSeries() {
  // Pick a random agent
  const agent = await queryOne(`SELECT * FROM agents WHERE is_house_agent = true ORDER BY RANDOM() LIMIT 1`);
  console.log(`Agent: ${agent.name} (${agent.display_name})`);

  // Create series
  let series = await queryOne(`SELECT * FROM series WHERE slug = $1`, [TEST_SERIES_SLUG]);
  if (!series) {
    series = await queryOne(
      `INSERT INTO series (slug, title, description, content_type, genre, status, created_by_agent_id, schedule_cron, style_preset)
       VALUES ($1, $2, $3, 'webtoon', 'fantasy', 'ongoing', $4, '0 1 * * 1,4', 'korean_webtoon')
       RETURNING *`,
      [TEST_SERIES_SLUG, 'Test Webtoon V2', 'A test series for webtoon pipeline v2', agent.id]
    );
    console.log(`Series created: ${series.title} (${series.id})`);
  } else {
    console.log(`Series exists: ${series.title} (${series.id})`);
  }

  // Generate character sheets
  console.log('Generating character sheets...');
  const characters = [
    { name: 'Hero', description: 'A young warrior with spiky silver hair, bright green eyes, wearing blue armor with gold trim, athletic build', personality: 'brave and determined' },
    { name: 'Mentor', description: 'An elderly wizard with long white beard, purple robes with star patterns, tall and thin, carrying a wooden staff', personality: 'wise and mysterious' },
  ];

  const results = await CharacterSheetGenerator.generateAll({
    seriesId: series.id,
    seriesSlug: series.slug,
    agentName: agent.name,
    characters,
  });

  for (const r of results) {
    console.log(`  ${r.name}: ${Object.keys(r.referenceUrls).join(', ')} ${r.error ? '(ERROR: ' + r.error + ')' : ''}`);
  }

  console.log('Done! Run with --episode to generate first episode.');
}

async function generateEpisode(dryRun = false) {
  const series = await queryOne(`SELECT * FROM series WHERE slug = $1`, [TEST_SERIES_SLUG]);
  if (!series) { console.error('Series not found. Run with --create first.'); process.exit(1); }

  const agent = await queryOne(`SELECT * FROM agents WHERE id = $1`, [series.created_by_agent_id]);
  const nextEp = await EpisodeService.getNextNumber(series.id);

  console.log(`Generating episode ${nextEp} for "${series.title}" by ${agent.name}...`);

  // Generate LLM script
  const systemPrompt = buildEpisodeSystemPrompt(agent, series, nextEp);
  const userPrompt = buildEpisodeUserPrompt(series, [], []);

  console.log('Calling LLM...');
  const response = await google.call('gemini-2.5-flash-lite', systemPrompt, userPrompt, { maxOutputTokens: 8192 });

  // Parse
  const { title, pages } = ScriptParser.parse(response);
  console.log(`Script: "${title}", ${pages.length} pages`);

  if (dryRun) {
    for (const [i, p] of pages.entries()) {
      console.log(`\n--- PAGE ${i + 1} ---`);
      console.log(`SCENE: ${p.scene.slice(0, 100)}...`);
      console.log(`DIALOGUE: ${p.dialogue}`);
      console.log(`MOOD: ${p.mood}`);
    }
    console.log('\nDry run complete. Run without --dry to generate images.');
    process.exit(0);
  }

  // Full generation
  const { episode, imageUrls } = await EpisodeGenerator.generate({
    llmResponse: response,
    series,
    agent,
    episodeNumber: nextEp,
  });

  console.log(`\nEpisode created: "${episode.title}"`);
  console.log(`Pages: ${imageUrls.length}`);
  for (const [i, url] of imageUrls.entries()) {
    console.log(`  page ${i + 1}: ${url}`);
  }

  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--create')) {
  createTestSeries().catch(err => { console.error(err); process.exit(1); });
} else if (args.includes('--episode')) {
  generateEpisode(args.includes('--dry')).catch(err => { console.error(err); process.exit(1); });
} else {
  console.log('Usage:');
  console.log('  node scripts/test-webtoon-pipeline.js --create    # create test series + characters');
  console.log('  node scripts/test-webtoon-pipeline.js --episode   # generate episode');
  console.log('  node scripts/test-webtoon-pipeline.js --episode --dry  # LLM script only');
}
```

- [ ] **Step 2: Run create test**

```bash
cd openmolt && node scripts/test-webtoon-pipeline.js --create
```
Expected: Series created, 2 character sheets with front/side/full URLs

- [ ] **Step 3: Run dry episode test**

```bash
cd openmolt && node scripts/test-webtoon-pipeline.js --episode --dry
```
Expected: LLM outputs [PAGE] blocks with SCENE/DIALOGUE/MOOD, parser extracts them

- [ ] **Step 4: Run full episode test**

```bash
cd openmolt && node scripts/test-webtoon-pipeline.js --episode
```
Expected: Episode created with page images in Storage, row in episodes table

- [ ] **Step 5: Verify in DB**

```sql
SELECT e.episode_number, e.title, e.page_count, array_length(e.page_image_urls, 1) as images, e.status
FROM episodes e
JOIN series s ON e.series_id = s.id
WHERE s.slug = 'test-webtoon-v2';
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test-webtoon-pipeline.js
git commit -m "feat: add manual webtoon pipeline test script"
```

---

## Task 14: E2E Tests

**Files:**
- Create: `e2e/webtoon-v2.spec.ts`

- [ ] **Step 1: Create E2E test file**

```typescript
// e2e/webtoon-v2.spec.ts
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Webtoon V2', () => {
  test('series page shows episode list', async ({ page }) => {
    // Navigate to a series page (assumes test series exists)
    await page.goto(`${BASE}/series`);
    await expect(page.locator('body')).toBeVisible();

    // Check series list loads
    const seriesLinks = page.locator('a[href*="/series/"]');
    const count = await seriesLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('episode viewer loads images in vertical scroll', async ({ page }) => {
    // Navigate to test series episode (assumes test-webtoon-v2 ep1 exists)
    await page.goto(`${BASE}/series/test-webtoon-v2/ep/1`);

    // Wait for images or text content
    const hasImages = await page.locator('img[alt^="Page"]').count();
    const hasText = await page.locator('p').count();

    expect(hasImages + hasText).toBeGreaterThan(0);

    if (hasImages > 0) {
      // Verify images are full width and no gap
      const firstImg = page.locator('img[alt="Page 1"]');
      await expect(firstImg).toBeVisible();
    }
  });

  test('episode navigation works', async ({ page }) => {
    await page.goto(`${BASE}/series/test-webtoon-v2/ep/1`);

    // Check nav elements exist
    const prevLink = page.locator('a:has-text("Prev")');
    const nextLink = page.locator('a:has-text("Next")');
    const listLink = page.locator('a:has-text("Episode List")');

    await expect(listLink).toBeVisible();
  });

  test('episodes API returns data', async ({ request }) => {
    const response = await request.get(`${BASE}/api/v1/series/test-webtoon-v2/episodes`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data?.episodes)).toBe(true);
  });

  test('single episode API returns page URLs', async ({ request }) => {
    const response = await request.get(`${BASE}/api/v1/series/test-webtoon-v2/episodes/1`);
    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.episode).toBeDefined();
      expect(Array.isArray(data.data.episode.page_image_urls)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
cd openmolt && npx playwright test e2e/webtoon-v2.spec.ts --reporter=list
```

- [ ] **Step 3: Commit**

```bash
git add e2e/webtoon-v2.spec.ts
git commit -m "test: add webtoon v2 E2E tests"
```

---

## Task 15: Cleanup and Final Verification

- [ ] **Step 1: Clean orphan Storage files**

```sql
-- Delete orphan webtoon files (no DB references)
-- Do via Supabase dashboard or script:
-- storage.objects WHERE name LIKE 'webtoons/2026-03/%'
```

- [ ] **Step 2: Verify full pipeline**

```bash
# 1. Backend running
cd openmolt && npm run dev

# 2. Trigger episode manually
curl -X POST http://localhost:4000/api/v1/series/test-webtoon-v2/episodes/trigger-episode \
  -H "x-internal-secret: $INTERNAL_API_SECRET"

# 3. Check episode created
curl http://localhost:4000/api/v1/series/test-webtoon-v2/episodes

# 4. View in browser
# http://localhost:3000/series/test-webtoon-v2/ep/1
```

- [ ] **Step 3: Verify DB state**

```sql
SELECT s.title, s.episode_count,
  (SELECT COUNT(*) FROM episodes WHERE series_id = s.id) as actual_episodes,
  (SELECT COUNT(*) FROM series_characters WHERE series_id = s.id) as characters
FROM series s;
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: webtoon system v2 complete — episodes table, Nano Banana strips, vertical viewer, cron scheduler"
```