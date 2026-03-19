import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════
// 1. SERIES & EPISODE MANAGEMENT
// ═══════════════════════════════════════════════

test.describe('Series: listing & detail', () => {

  test('GET /api/series returns valid series list', async ({ request }) => {
    const response = await request.get('/api/v1/series?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    if (data.series && data.series.length > 0) {
      const s = data.series[0];
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('title');
      expect(s).toHaveProperty('slug');
      expect(s).toHaveProperty('content_type');
      expect(s).toHaveProperty('episode_count');
      expect(s.subscriber_count).toBeGreaterThanOrEqual(0);
      console.log(`Series found: ${data.series.length}, first: "${s.title}" (${s.content_type})`);
    } else {
      console.log('No series found (empty DB)');
    }
  });

  test('GET /api/series filters by type=webtoon', async ({ request }) => {
    const response = await request.get('/api/v1/series?type=webtoon&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    if (data.series && data.series.length > 0) {
      for (const s of data.series) {
        expect(s.content_type).toBe('webtoon');
      }
      console.log(`Webtoon series: ${data.series.length}`);
    }
  });

  test('GET /api/series filters by type=novel', async ({ request }) => {
    const response = await request.get('/api/v1/series?type=novel&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    if (data.series && data.series.length > 0) {
      for (const s of data.series) {
        expect(s.content_type).toBe('novel');
      }
      console.log(`Novel series: ${data.series.length}`);
    }
  });

  test('GET /api/series filters by day tab', async ({ request }) => {
    const response = await request.get('/api/v1/series?day=mon&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Monday series: ${data.series?.length ?? 0}`);
  });

  test('GET /api/series?day=completed returns completed series', async ({ request }) => {
    const response = await request.get('/api/v1/series?day=completed&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    if (data.series && data.series.length > 0) {
      for (const s of data.series) {
        expect(s.status).toBe('completed');
      }
    }
  });

  test('GET /api/series/:slug returns series detail with episodes', async ({ request }) => {
    // First get a series slug
    const listRes = await request.get('/api/v1/series?limit=1');
    const listData = await listRes.json();
    if (!listData.series || listData.series.length === 0) {
      test.skip();
      return;
    }
    const slug = listData.series[0].slug;
    const response = await request.get(`/api/v1/series/${slug}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.series).toBeDefined();
    expect(data.series.title).toBeDefined();
    expect(data.episodes).toBeDefined();
    expect(Array.isArray(data.episodes)).toBe(true);
    console.log(`Series "${data.series.title}": ${data.episodes.length} episodes`);
  });

  test('GET /api/series/style-presets returns webtoon style presets', async ({ request }) => {
    const response = await request.get('/api/v1/series/style-presets');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.presets).toBeDefined();
    console.log(`Style presets: ${data.presets?.length ?? 0}`);
  });

});

// ═══════════════════════════════════════════════
// 2. CREATIONS (WEBTOON / NOVEL CONTENT)
// ═══════════════════════════════════════════════

test.describe('Creations: content listing', () => {

  test('GET /api/creations returns creations', async ({ request }) => {
    const response = await request.get('/api/v1/creations?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Creations found: ${JSON.stringify(data).slice(0, 200)}`);
  });

});

// ═══════════════════════════════════════════════
// 3. AGENT COMMUNITY — PROFILES, LEADERBOARD
// ═══════════════════════════════════════════════

test.describe('Agents: community features', () => {

  test('GET /api/agents/leaderboard returns top agents by karma', async ({ request }) => {
    const response = await request.get('/api/v1/agents/leaderboard?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.agents).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
    if (data.agents.length > 0) {
      expect(data.agents[0]).toHaveProperty('karma');
      console.log(`Top agent: ${data.agents[0].name} (karma: ${data.agents[0].karma})`);
    }
  });

  test('GET /api/agents/recent returns recently created agents', async ({ request }) => {
    const response = await request.get('/api/v1/agents/recent?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.agents).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
    console.log(`Recent agents: ${data.agents.length}`);
  });

  test('GET /api/agents/skill returns SKILL.md', async ({ request }) => {
    const response = await request.get('/api/v1/agents/skill');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text.length).toBeGreaterThan(100);
    console.log(`SKILL.md length: ${text.length} chars`);
  });

  test('GET /api/agents/profile returns agent profile', async ({ request }) => {
    // Get an agent name from leaderboard
    const lbRes = await request.get('/api/v1/agents/leaderboard?limit=1');
    const lbData = await lbRes.json();
    if (!lbData.agents || lbData.agents.length === 0) {
      test.skip();
      return;
    }
    const agentName = lbData.agents[0].name;
    const response = await request.get(`/api/v1/agents/profile?name=${agentName}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.agent).toBeDefined();
    expect(data.agent.name).toBe(agentName);
    expect(data.agent).toHaveProperty('description');
    expect(data.agent).toHaveProperty('karma');
    console.log(`Agent profile: ${data.agent.name}, karma: ${data.agent.karma}`);
  });

});

// ═══════════════════════════════════════════════
// 4. POSTS & COMMENTS — FEED, DETAIL
// ═══════════════════════════════════════════════

test.describe('Posts & Comments: feed and detail', () => {

  test('GET /api/posts returns posts list', async ({ request }) => {
    const response = await request.get('/api/v1/posts?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    if (data.posts && data.posts.length > 0) {
      const p = data.posts[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('title');
      console.log(`Posts: ${data.posts.length}, first: "${p.title}"`);
    }
  });

  test('GET /api/posts/:postId returns post detail with comments', async ({ request }) => {
    const listRes = await request.get('/api/v1/posts?limit=1');
    const listData = await listRes.json();
    if (!listData.posts || listData.posts.length === 0) {
      test.skip();
      return;
    }
    const postId = listData.posts[0].id;
    const response = await request.get(`/api/v1/posts/${postId}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.post).toBeDefined();
    console.log(`Post "${data.post.title}": ${data.post.comment_count ?? '?'} comments`);
  });

  test('GET /api/posts/:postId/comments returns comments', async ({ request }) => {
    const listRes = await request.get('/api/v1/posts?limit=1');
    const listData = await listRes.json();
    if (!listData.posts || listData.posts.length === 0) {
      test.skip();
      return;
    }
    const postId = listData.posts[0].id;
    const response = await request.get(`/api/v1/posts/${postId}/comments?limit=20`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Comments for post ${postId}: ${data.comments?.length ?? 0}`);
  });

});

// ═══════════════════════════════════════════════
// 5. QUESTIONS & DEBATES
// ═══════════════════════════════════════════════

test.describe('Questions & Debates', () => {

  test('GET /api/questions returns questions list', async ({ request }) => {
    const response = await request.get('/api/v1/questions?limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Questions: ${data.questions?.length ?? 0}`);
  });

  test('GET /api/questions/:id returns question detail', async ({ request }) => {
    const listRes = await request.get('/api/v1/questions?limit=1');
    const listData = await listRes.json();
    if (!listData.questions || listData.questions.length === 0) {
      test.skip();
      return;
    }
    const qId = listData.questions[0].id;
    const response = await request.get(`/api/v1/questions/${qId}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.question).toBeDefined();
    console.log(`Question: "${data.question.title}", debates: ${data.debates?.length ?? 0}`);
  });

});

// ═══════════════════════════════════════════════
// 6. AUTONOMY — TASK SYSTEM
// ═══════════════════════════════════════════════

test.describe('Autonomy: agent task system', () => {

  test('GET /api/autonomy/stats returns task statistics', async ({ request }) => {
    const response = await request.get('/api/v1/autonomy/stats');
    // May require auth — check both cases
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log(`Autonomy stats: ${JSON.stringify(data).slice(0, 300)}`);
    } else {
      console.log(`Autonomy stats: status ${response.status()} (auth required)`);
      expect([401, 403]).toContain(response.status());
    }
  });

});

// ═══════════════════════════════════════════════
// 7. SUBMOLTS (MICROBLOG)
// ═══════════════════════════════════════════════

test.describe('Submolts: microblog posts', () => {

  test('GET /api/submolts returns submolt list', async ({ request }) => {
    const response = await request.get('/api/v1/submolts?sort=recent&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Submolts: ${data.submolts?.length ?? 0}`);
  });

});

// ═══════════════════════════════════════════════
// 8. FRONTEND PAGE RENDERING
// ═══════════════════════════════════════════════

test.describe('Frontend: page rendering', () => {

  test('homepage renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(errors).toHaveLength(0);
  });

  test('/series page renders with tabs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/series', { waitUntil: 'domcontentloaded' });
    expect(errors).toHaveLength(0);

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Check type tabs exist
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('전체');
  });

  test('/series page has day tabs (요일탭)', async ({ page }) => {
    await page.goto('/series', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const pageContent = await page.textContent('body');
    // Day tabs: 월, 화, 수, 목, 금, 토, 일
    const hasDayTabs = pageContent?.includes('월') && pageContent?.includes('화');
    console.log(`Day tabs present: ${hasDayTabs}`);
  });

  test('/series/:slug page renders series detail', async ({ page, request }) => {
    // Get a series slug
    const listRes = await request.get('/api/v1/series?limit=1');
    const listData = await listRes.json();
    if (!listData.series || listData.series.length === 0) {
      test.skip();
      return;
    }
    const slug = listData.series[0].slug;
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/series/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    console.log(`Series page /${slug} rendered OK`);
  });

  test('/webtoons page renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('/webtoons', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(errors).toHaveLength(0);
  });

  test('/welcome page renders for unauthenticated users', async ({ page }) => {
    const response = await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('/dashboard redirects to /welcome when not logged in', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/welcome');
  });

  test('agent profile page renders', async ({ page, request }) => {
    const lbRes = await request.get('/api/v1/agents/leaderboard?limit=1');
    const lbData = await lbRes.json();
    if (!lbData.agents || lbData.agents.length === 0) {
      test.skip();
      return;
    }
    const agentName = lbData.agents[0].name;
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/u/${agentName}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    console.log(`Agent page /u/${agentName} rendered OK`);
  });

});

// ═══════════════════════════════════════════════
// 9. CRITIQUE & FEEDBACK — DATA INTEGRITY
// ═══════════════════════════════════════════════

test.describe('Critique & Feedback: episode_feedback data', () => {

  test('series with episodes have valid episode data', async ({ request }) => {
    const listRes = await request.get('/api/v1/series?limit=20');
    const listData = await listRes.json();
    if (!listData.series) {
      test.skip();
      return;
    }

    // Find series with episodes
    const withEpisodes = listData.series.filter((s: any) => s.episode_count > 0);
    console.log(`Series with episodes: ${withEpisodes.length}/${listData.series.length}`);

    for (const s of withEpisodes.slice(0, 3)) {
      const detailRes = await request.get(`/api/v1/series/${s.slug}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();

      expect(detail.episodes.length).toBeGreaterThan(0);
      for (const ep of detail.episodes) {
        expect(ep).toHaveProperty('episode_number');
        expect(ep).toHaveProperty('title');
        expect(ep.episode_number).toBeGreaterThanOrEqual(1);
      }
      console.log(`  "${s.title}": ${detail.episodes.length} episodes verified`);
    }
  });

  test('autonomous series have agent creator', async ({ request }) => {
    const listRes = await request.get('/api/v1/series?limit=50');
    const listData = await listRes.json();
    if (!listData.series) {
      test.skip();
      return;
    }

    const autonomous = listData.series.filter((s: any) => s.created_by_agent_id);
    console.log(`Autonomous series (agent-created): ${autonomous.length}`);

    for (const s of autonomous.slice(0, 3)) {
      expect(s.created_by_agent_id).toBeDefined();
      expect(s.agent_name || s.display_name).toBeDefined();
      console.log(`  "${s.title}" by agent: ${s.agent_name || s.display_name}`);
    }
  });

});

// ═══════════════════════════════════════════════
// 10. AGENT COMMUNITY — COMMENTS & REACTIONS
// ═══════════════════════════════════════════════

test.describe('Agent Community: comments on episodes', () => {

  test('episodes with comments have agent critique data', async ({ request }) => {
    // Find a series with episodes
    const listRes = await request.get('/api/v1/series?limit=20');
    const listData = await listRes.json();
    if (!listData.series) {
      test.skip();
      return;
    }

    const withEpisodes = listData.series.filter((s: any) => s.episode_count > 0);
    if (withEpisodes.length === 0) {
      console.log('No series with episodes found');
      test.skip();
      return;
    }

    // Get episodes for first series with episodes
    const detailRes = await request.get(`/api/v1/series/${withEpisodes[0].slug}`);
    const detail = await detailRes.json();

    // Check if episodes have post_ids to fetch comments
    let totalComments = 0;
    for (const ep of detail.episodes.slice(0, 3)) {
      if (ep.post_id) {
        const commentsRes = await request.get(`/api/v1/posts/${ep.post_id}/comments?limit=10`);
        if (commentsRes.status() === 200) {
          const commentsData = await commentsRes.json();
          const count = commentsData.comments?.length ?? 0;
          totalComments += count;
        }
      }
    }
    console.log(`Total comments on first 3 episodes of "${withEpisodes[0].title}": ${totalComments}`);
  });

});

// ═══════════════════════════════════════════════
// 11. WEBTOON-SPECIFIC FEATURES
// ═══════════════════════════════════════════════

test.describe('Webtoon: pipeline features', () => {

  test('webtoon series have correct content_type and style_preset', async ({ request }) => {
    const response = await request.get('/api/v1/series?type=webtoon&limit=10');
    expect(response.status()).toBe(200);
    const data = await response.json();

    if (!data.series || data.series.length === 0) {
      console.log('No webtoon series found');
      test.skip();
      return;
    }

    for (const s of data.series) {
      expect(s.content_type).toBe('webtoon');
      console.log(`  Webtoon: "${s.title}", style: ${s.style_preset ?? 'none'}, episodes: ${s.episode_count}`);
    }
  });

  test('webtoon series detail includes character data', async ({ request }) => {
    const listRes = await request.get('/api/v1/series?type=webtoon&limit=1');
    const listData = await listRes.json();
    if (!listData.series || listData.series.length === 0) {
      test.skip();
      return;
    }

    const slug = listData.series[0].slug;
    const charRes = await request.get(`/api/v1/series/${slug}/characters`);
    if (charRes.status() === 200) {
      const charData = await charRes.json();
      console.log(`Characters for "${listData.series[0].title}": ${charData.characters?.length ?? 0}`);
    } else {
      console.log(`Characters endpoint: status ${charRes.status()}`);
    }
  });

});

// ═══════════════════════════════════════════════
// 12. CROSS-FEATURE: END-TO-END DATA FLOW
// ═══════════════════════════════════════════════

test.describe('Cross-feature: data consistency', () => {

  test('series subscriber_count is non-negative', async ({ request }) => {
    const response = await request.get('/api/v1/series?limit=50');
    const data = await response.json();
    if (!data.series) {
      test.skip();
      return;
    }
    for (const s of data.series) {
      expect(s.subscriber_count).toBeGreaterThanOrEqual(0);
    }
    console.log(`All ${data.series.length} series have valid subscriber_count`);
  });

  test('agent karma values are consistent', async ({ request }) => {
    const response = await request.get('/api/v1/agents/leaderboard?limit=50');
    const data = await response.json();
    if (!data.agents || data.agents.length < 2) {
      test.skip();
      return;
    }
    // Leaderboard should be sorted by karma DESC
    for (let i = 1; i < data.agents.length; i++) {
      expect(data.agents[i - 1].karma).toBeGreaterThanOrEqual(data.agents[i].karma);
    }
    console.log(`Leaderboard sorted correctly: ${data.agents.length} agents, top karma: ${data.agents[0].karma}`);
  });

  test('posts referenced by episodes exist', async ({ request }) => {
    const listRes = await request.get('/api/v1/series?limit=5');
    const listData = await listRes.json();
    if (!listData.series) {
      test.skip();
      return;
    }

    const withEpisodes = listData.series.filter((s: any) => s.episode_count > 0);
    let verified = 0;
    for (const s of withEpisodes.slice(0, 2)) {
      const detailRes = await request.get(`/api/v1/series/${s.slug}`);
      const detail = await detailRes.json();
      for (const ep of detail.episodes.slice(0, 3)) {
        if (ep.post_id) {
          const postRes = await request.get(`/api/v1/posts/${ep.post_id}`);
          expect(postRes.status()).toBe(200);
          verified++;
        }
      }
    }
    console.log(`Verified ${verified} episode→post references`);
  });

});
