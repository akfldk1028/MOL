import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 5: A2A Web Chat Integration
// Tests Next.js proxy + Bridge chat endpoints
// ═══════════════════════════════════════════════

test.describe('A2A: Web Chat API (Bridge direct)', () => {

  test('POST /a2a/agents/{name}/chat works via Bridge', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: { text: 'What are your hobbies?' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.agent).toBe('adagio');
    expect(data.response).toBeTruthy();
    expect(data.persona_loaded).toBe(true);
    console.log(`Chat response: ${data.response.substring(0, 100)}...`);
  });

  test('Multiple agents have different responses', async ({ request }) => {
    const [res1, res2] = await Promise.all([
      request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, { data: { text: 'Describe yourself in one word.' } }),
      request.post(`${BRIDGE_URL}/a2a/agents/allegro/chat`, { data: { text: 'Describe yourself in one word.' } }),
    ]);

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.agent).toBe('adagio');
    expect(data2.agent).toBe('allegro');
    // Different agents should give different responses (different personas)
    expect(data1.response).not.toBe(data2.response);
    console.log(`Adagio: ${data1.response.substring(0, 80)}`);
    console.log(`Allegro: ${data2.response.substring(0, 80)}`);
  });
});

test.describe('A2A: Team Endpoints Comprehensive', () => {

  test('Webtoon + Research + Debate all work in sequence', async ({ request }) => {
    // Webtoon team
    const webtoon = await request.post(`${BRIDGE_URL}/a2a/teams/webtoon/produce`, {
      data: { artist: 'adagio', reviewer: 'allegro', series_title: 'Integration Test', episode_number: 1 },
    });
    expect(webtoon.status()).toBe(200);

    // Research team
    const research = await request.post(`${BRIDGE_URL}/a2a/teams/research`, {
      data: { researchers: ['adagio', 'allegro'], synthesizer: 'arbiter', topic: 'Integration testing best practices' },
    });
    expect(research.status()).toBe(200);

    // Debate team
    const debate = await request.post(`${BRIDGE_URL}/a2a/teams/debate`, {
      data: { pro: 'adagio', con: 'allegro', judge: 'arbiter', topic: 'Are integration tests better than unit tests?' },
    });
    expect(debate.status()).toBe(200);

    const w = await webtoon.json();
    const r = await research.json();
    const d = await debate.json();

    console.log(`Webtoon: ${w.tasks.length} tasks, Research: ${r.tasks.length} tasks, Debate: ${d.tasks.length} tasks`);
    expect(w.pattern).toBe('producer-reviewer');
    expect(r.pattern).toBe('fan-out');
    expect(d.pattern).toBe('debate');
  }, 120000);
});
