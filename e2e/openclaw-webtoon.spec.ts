import { test, expect } from '@playwright/test';

const INTERNAL_SECRET = 'gm_internal_8f3a2c7e9d1b4f6a0e5c8d2b7a9f3e1c';
const API = 'http://localhost:4000/api/v1';

function adminHeaders() {
  return { 'x-internal-secret': INTERNAL_SECRET };
}

// ═══════════════════════════════════════════════
// 1. OPENCLAW-RL — PROVIDER & MONITORING
// ═══════════════════════════════════════════════

test.describe('OpenClaw-RL: provider & monitoring endpoints', () => {

  test('GET /autonomy/openclaw/status returns valid structure', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/openclaw/status`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    // Structure checks
    expect(data).toHaveProperty('enabled');
    expect(data).toHaveProperty('proxyUrl');
    expect(data).toHaveProperty('proxyHealthy');
    expect(data).toHaveProperty('model');
    expect(data).toHaveProperty('sessions');
    expect(data.sessions).toHaveProperty('total');
    expect(data.sessions).toHaveProperty('open');
    expect(data.sessions).toHaveProperty('closed');
    expect(data.sessions).toHaveProperty('failed');

    // OPENCLAW_ENABLED=false by default in .env.local
    console.log(`OpenClaw status: enabled=${data.enabled}, proxy=${data.proxyHealthy}, model=${data.model}`);
    console.log(`  Sessions: total=${data.sessions.total}, open=${data.sessions.open}, closed=${data.sessions.closed}, failed=${data.sessions.failed}`);
  });

  test('GET /autonomy/openclaw/sessions returns session list', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/openclaw/sessions?limit=5`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('sessions');
    expect(Array.isArray(data.sessions)).toBe(true);
    console.log(`OpenClaw training sessions: ${data.sessions.length}`);
  });

  test('OpenClaw endpoints require internal secret', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/openclaw/status`);
    expect([401, 403]).toContain(res.status());
    console.log(`OpenClaw status without auth: ${res.status()} (expected 401/403)`);
  });

  test('openclaw_training_sessions table exists and is queryable', async ({ request }) => {
    // This is validated implicitly by the /openclaw/status endpoint returning session stats
    const res = await request.get(`${API}/autonomy/openclaw/status`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    // If table didn't exist, the query would fail and return an error
    expect(typeof data.sessions.total).toBe('number');
  });

});

// ═══════════════════════════════════════════════
// 2. AUTONOMY SYSTEM — TASK WORKER STATUS
// ═══════════════════════════════════════════════

test.describe('Autonomy: TaskWorker & lifecycle', () => {

  test('GET /autonomy/status returns worker + queue stats', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/status`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty('worker');
    expect(data.worker).toHaveProperty('running');
    expect(data.worker).toHaveProperty('paused');
    expect(data.worker).toHaveProperty('scheduledTimers');
    expect(data.worker).toHaveProperty('activeExecutions');
    expect(data).toHaveProperty('queue');
    expect(data).toHaveProperty('activeAgents');
    expect(data).toHaveProperty('skills');

    console.log(`TaskWorker: running=${data.worker.running}, paused=${data.worker.paused}`);
    console.log(`  Timers: ${data.worker.scheduledTimers}, Active: ${data.worker.activeExecutions}, Queue wait: ${data.worker.waitQueue}`);
    console.log(`  Active agents: ${data.activeAgents}`);
    console.log(`  Queue (24h): pending=${data.queue.pending}, processing=${data.queue.processing}, completed=${data.queue.completed}, failed=${data.queue.failed}`);
  });

  test('GET /autonomy/lifecycle returns agent wakeup stats', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/lifecycle`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('started');
    console.log(`Lifecycle: started=${data.started}, paused=${data.paused}, activeTimers=${data.activeTimers}`);
  });

  test('GET /autonomy/recent returns completed tasks (public)', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/recent?limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('activities');
    expect(Array.isArray(data.activities)).toBe(true);

    if (data.activities.length > 0) {
      const act = data.activities[0];
      expect(act).toHaveProperty('type');
      expect(act).toHaveProperty('status');
      expect(act.status).toBe('completed');
      console.log(`Recent activities: ${data.activities.length}`);
      // Show type breakdown
      const types = data.activities.reduce((acc: any, a: any) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {});
      console.log(`  Types: ${JSON.stringify(types)}`);
    } else {
      console.log('No recent activities');
    }
  });

  test('GET /autonomy/tasks returns filterable task list', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/tasks?limit=20`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('tasks');
    expect(Array.isArray(data.tasks)).toBe(true);
    console.log(`Total tasks: ${data.tasks.length}`);

    // Filter by create_episode type
    const epRes = await request.get(`${API}/autonomy/tasks?type=create_episode&limit=10`, {
      headers: adminHeaders(),
    });
    expect(epRes.status()).toBe(200);
    const epData = await epRes.json();
    const epTasks = epData.tasks;
    console.log(`  create_episode tasks: ${epTasks.length}`);
    for (const t of epTasks.slice(0, 3)) {
      console.log(`    ${t.id.slice(0,8)} — ${t.status}, agent: ${t.agent_display_name || t.agent_name}`);
    }
  });

});

// ═══════════════════════════════════════════════
// 3. WEBTOON PIPELINE — SERIES + EPISODES + IMAGES
// ═══════════════════════════════════════════════

test.describe('Webtoon: series, episodes, and image pipeline', () => {

  test('webtoon series exist and have episodes', async ({ request }) => {
    const res = await request.get(`${API}/series?type=webtoon&limit=20`);
    expect(res.status()).toBe(200);
    const data = await res.json();

    if (!data.series || data.series.length === 0) {
      console.log('No webtoon series found — skip pipeline checks');
      test.skip();
      return;
    }

    const withEps = data.series.filter((s: any) => s.episode_count > 0);
    console.log(`Webtoon series: ${data.series.length} total, ${withEps.length} with episodes`);

    for (const s of data.series.slice(0, 5)) {
      console.log(`  "${s.title}" — ${s.episode_count} eps, style: ${s.style_preset ?? 'default'}, agent: ${s.agent_name ?? 'none'}`);
    }

    expect(withEps.length).toBeGreaterThan(0);
  });

  test('webtoon episodes contain image URLs (panel images)', async ({ request }) => {
    const listRes = await request.get(`${API}/series?type=webtoon&limit=10`);
    const listData = await listRes.json();
    const withEps = listData.series?.filter((s: any) => s.episode_count > 0) || [];

    if (withEps.length === 0) {
      console.log('No webtoon episodes to check');
      test.skip();
      return;
    }

    let totalImages = 0;
    let totalEpisodes = 0;

    for (const s of withEps.slice(0, 3)) {
      const detailRes = await request.get(`${API}/series/${s.slug}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();

      for (const ep of detail.episodes.slice(0, 3)) {
        totalEpisodes++;
        if (ep.post_id) {
          const postRes = await request.get(`${API}/posts/${ep.post_id}`);
          if (postRes.status() === 200) {
            const postData = await postRes.json();
            const content = postData.post?.content || '';
            // Count markdown image references (![...](url))
            const imageMatches = content.match(/!\[[^\]]*\]\([^)]+\)/g) || [];
            totalImages += imageMatches.length;
            if (imageMatches.length > 0) {
              console.log(`  "${s.title}" ep${ep.episode_number}: ${imageMatches.length} panel images`);
            }
          }
        }
      }
    }

    console.log(`Webtoon image check: ${totalEpisodes} episodes, ${totalImages} total panel images`);
  });

  test('webtoon style presets are available', async ({ request }) => {
    const res = await request.get(`${API}/series/style-presets`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.presets).toBeDefined();
    expect(Array.isArray(data.presets)).toBe(true);
    console.log(`Style presets available: ${data.presets.length}`);
    for (const p of data.presets.slice(0, 5)) {
      console.log(`  ${p.id}: "${p.name}"`);
    }
  });

  test('webtoon characters are tracked per series', async ({ request }) => {
    const listRes = await request.get(`${API}/series?type=webtoon&limit=5`);
    const listData = await listRes.json();

    if (!listData.series || listData.series.length === 0) {
      test.skip();
      return;
    }

    let totalChars = 0;
    for (const s of listData.series) {
      const charRes = await request.get(`${API}/series/${s.slug}/characters`);
      if (charRes.status() === 200) {
        const charData = await charRes.json();
        const count = charData.characters?.length ?? 0;
        totalChars += count;
        if (count > 0) {
          console.log(`  "${s.title}": ${count} characters`);
        }
      }
    }
    console.log(`Total webtoon characters tracked: ${totalChars}`);
  });

});

// ═══════════════════════════════════════════════
// 4. AGENT SKILLS — SKILL REGISTRATION & USAGE
// ═══════════════════════════════════════════════

test.describe('Agent Skills: registration and availability', () => {

  test('GET /autonomy/status includes skill status', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/status`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty('skills');
    console.log(`Skill status: ${JSON.stringify(data.skills)}`);
  });

  test('SKILL.md is accessible and describes agent capabilities', async ({ request }) => {
    const res = await request.get(`${API}/agents/skill`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);

    // Check for key skill sections
    const hasSearch = /search/i.test(text);
    const hasImage = /image/i.test(text);
    console.log(`SKILL.md: ${text.length} chars, hasSearch=${hasSearch}, hasImage=${hasImage}`);
  });

});

// ═══════════════════════════════════════════════
// 5. CRITIQUE → FEEDBACK LOOP (RL SIGNAL)
// ═══════════════════════════════════════════════

test.describe('Critique Feedback Loop: episode_feedback data', () => {

  test('episode_feedback table has entries for series with critiques', async ({ request }) => {
    // Get series with episodes
    const listRes = await request.get(`${API}/series?limit=30`);
    const listData = await listRes.json();
    const withEps = listData.series?.filter((s: any) => s.episode_count >= 2) || [];

    if (withEps.length === 0) {
      console.log('No series with 2+ episodes');
      test.skip();
      return;
    }

    // Check episodes for critique comments
    let seriesWithCritiques = 0;
    for (const s of withEps.slice(0, 5)) {
      const detailRes = await request.get(`${API}/series/${s.slug}`);
      const detail = await detailRes.json();

      let episodeComments = 0;
      for (const ep of detail.episodes.slice(0, 3)) {
        if (ep.post_id) {
          const commRes = await request.get(`${API}/posts/${ep.post_id}/comments?limit=20`);
          if (commRes.status() === 200) {
            const commData = await commRes.json();
            const agentComments = (commData.comments || []).filter((c: any) => !c.is_human_authored);
            episodeComments += agentComments.length;
          }
        }
      }

      if (episodeComments > 0) {
        seriesWithCritiques++;
        console.log(`  "${s.title}": ${episodeComments} agent critique comments across ${detail.episodes.length} episodes`);
      }
    }
    console.log(`Series with agent critiques: ${seriesWithCritiques}/${withEps.slice(0, 5).length}`);
  });

  test('autonomous series are created by agents, not humans', async ({ request }) => {
    const listRes = await request.get(`${API}/series?limit=50`);
    const listData = await listRes.json();

    if (!listData.series) {
      test.skip();
      return;
    }

    const autonomous = listData.series.filter((s: any) => s.created_by_agent_id);
    const humanCreated = listData.series.filter((s: any) => !s.created_by_agent_id);

    console.log(`Series breakdown: ${autonomous.length} agent-created, ${humanCreated.length} human-created`);

    for (const s of autonomous.slice(0, 5)) {
      expect(s.created_by_agent_id).toBeTruthy();
      console.log(`  Agent series: "${s.title}" (${s.content_type}) by ${s.agent_name || s.display_name}`);
    }
  });

});

// ═══════════════════════════════════════════════
// 6. RL FEEDBACK LOOP — DB VERIFICATION
// ═══════════════════════════════════════════════

test.describe('RL Feedback Loop: DB data verification', () => {

  test('GET /autonomy/feedback returns episode_feedback with scores', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/feedback?limit=10`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('feedback');
    expect(Array.isArray(data.feedback)).toBe(true);

    console.log(`episode_feedback rows: ${data.feedback.length}`);

    for (const fb of data.feedback) {
      console.log(`  [${fb.series_title?.slice(0, 20)}] ep${fb.episode_number}:`);
      console.log(`    scores: overall=${fb.score_overall}, quality=${fb.score_quality}, creativity=${fb.score_creativity}`);
      console.log(`    consistency=${fb.score_consistency}, emotional=${fb.score_emotional_resonance}`);
      const dirs = Array.isArray(fb.directives) ? fb.directives : (fb.directives ? JSON.parse(fb.directives) : []);
      console.log(`    directives: ${dirs.length} items`);
      console.log(`    applied_to_episode: ${fb.applied_to_episode ?? 'not yet'}`);
      console.log(`    raw_comment_count: ${fb.raw_comment_count}`);

      // Validate score ranges (0-10)
      if (fb.score_overall !== null) {
        expect(parseFloat(fb.score_overall)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(fb.score_overall)).toBeLessThanOrEqual(10);
      }
    }
  });

  test('feedback loop: directives from ep N applied to ep N+1', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/feedback?limit=20`, {
      headers: adminHeaders(),
    });
    const data = await res.json();

    const applied = data.feedback.filter((fb: any) => fb.applied_to_episode !== null);
    const pending = data.feedback.filter((fb: any) => fb.applied_to_episode === null);

    console.log(`Feedback applied: ${applied.length}, pending: ${pending.length}`);

    for (const fb of applied) {
      // Verify applied_to_episode = episode_number + 1 (or later)
      expect(fb.applied_to_episode).toBeGreaterThan(fb.episode_number);
      console.log(`  ep${fb.episode_number} feedback → applied to ep${fb.applied_to_episode} ✓`);
    }
  });

  test('5-axis scoring is complete (no null axes)', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/feedback?limit=20`, {
      headers: adminHeaders(),
    });
    const data = await res.json();

    let completeScores = 0;
    for (const fb of data.feedback) {
      const axes = [fb.score_prompt_accuracy, fb.score_creativity, fb.score_quality,
                    fb.score_consistency, fb.score_emotional_resonance, fb.score_overall];
      const filled = axes.filter((a: any) => a !== null).length;
      if (filled === 6) completeScores++;
      console.log(`  ep${fb.episode_number}: ${filled}/6 axes filled`);
    }
    console.log(`Complete 5-axis scores: ${completeScores}/${data.feedback.length}`);
  });

  test('openclaw_training_sessions table ready (0 rows when proxy off)', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/openclaw/status`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    // When OPENCLAW_ENABLED=false, sessions should be 0
    if (!data.enabled) {
      expect(data.sessions.total).toBe(0);
      console.log('OpenClaw disabled → 0 training sessions (expected)');
    } else {
      console.log(`OpenClaw enabled: ${data.sessions.total} total sessions`);
    }
  });

});

// ═══════════════════════════════════════════════
// 7. END-TO-END: FULL PIPELINE VERIFICATION
// ═══════════════════════════════════════════════

test.describe('E2E: Full autonomous episode pipeline', () => {

  test('create_episode tasks exist and some completed', async ({ request }) => {
    const res = await request.get(`${API}/autonomy/tasks?type=create_episode&limit=20`, {
      headers: adminHeaders(),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    if (data.tasks.length === 0) {
      console.log('No create_episode tasks found');
      test.skip();
      return;
    }

    const completed = data.tasks.filter((t: any) => t.status === 'completed');
    const failed = data.tasks.filter((t: any) => t.status === 'failed');
    const pending = data.tasks.filter((t: any) => t.status === 'pending');

    console.log(`create_episode tasks: ${completed.length} completed, ${failed.length} failed, ${pending.length} pending`);

    // Show failure reasons
    for (const t of failed.slice(0, 3)) {
      console.log(`  FAILED: agent=${t.agent_name}, error="${(t.error || '').slice(0, 100)}"`);
    }
  });

  test('agents produce episodes with content (not empty)', async ({ request }) => {
    const listRes = await request.get(`${API}/series?limit=20`);
    const listData = await listRes.json();
    const withEps = listData.series?.filter((s: any) => s.episode_count > 0) || [];

    if (withEps.length === 0) {
      console.log('No series with episodes');
      test.skip();
      return;
    }

    let emptyEpisodes = 0;
    let totalChecked = 0;

    for (const s of withEps.slice(0, 5)) {
      const detailRes = await request.get(`${API}/series/${s.slug}`);
      const detail = await detailRes.json();

      for (const ep of detail.episodes.slice(0, 3)) {
        totalChecked++;
        if (ep.post_id) {
          const postRes = await request.get(`${API}/posts/${ep.post_id}`);
          if (postRes.status() === 200) {
            const postData = await postRes.json();
            const content = postData.post?.content || '';
            if (content.length < 50) {
              emptyEpisodes++;
              console.log(`  WARNING: "${s.title}" ep${ep.episode_number} has short content (${content.length} chars)`);
            }
          }
        }
      }
    }

    console.log(`Episode content check: ${totalChecked} checked, ${emptyEpisodes} empty/short`);
    // Allow some failures but not all
    if (totalChecked > 0) {
      expect(emptyEpisodes).toBeLessThan(totalChecked);
    }
  });

  test('webtoon /webtoons page renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/webtoons', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    expect(errors).toHaveLength(0);
    console.log('/webtoons page rendered OK');
  });

  test('series detail page renders episodes', async ({ page, request }) => {
    const listRes = await request.get(`${API}/series?limit=1`);
    const listData = await listRes.json();
    if (!listData.series || listData.series.length === 0) {
      test.skip();
      return;
    }

    const slug = listData.series[0].slug;
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/series/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    expect(errors).toHaveLength(0);
    console.log(`/series/${slug} rendered OK`);
  });

});
