import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 3: A2A Webtoon Production Team
// Producer-Reviewer pattern from Harness
// ═══════════════════════════════════════════════

test.describe('A2A: Webtoon Team — Producer-Reviewer', () => {

  test('POST /a2a/teams/webtoon/produce creates episode with review loop', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/webtoon/produce`, {
      data: {
        artist: 'adagio',
        reviewer: 'allegro',
        series_title: 'The Tower of Dreams',
        episode_number: 1,
        style_notes: 'Fantasy adventure, vivid descriptions',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    // Pattern should be producer-reviewer
    expect(data.pattern).toBe('producer-reviewer');

    // Should have at least 2 tasks: 1 create + 1 review
    expect(data.tasks.length).toBeGreaterThanOrEqual(2);

    // First task is artist creating
    expect(data.tasks[0].member).toBe('adagio');
    expect(data.tasks[0].role).toBe('artist');
    expect(data.tasks[0].status).toBe('completed');

    // Second task is reviewer reviewing
    expect(data.tasks[1].member).toBe('allegro');
    expect(data.tasks[1].role).toBe('reviewer');
    expect(data.tasks[1].status).toBe('completed');

    // Final output should be substantial
    expect(data.final_output.length).toBeGreaterThan(100);

    // Review rounds should be 1-2
    expect(data.total_rounds).toBeGreaterThanOrEqual(1);
    expect(data.total_rounds).toBeLessThanOrEqual(2);

    console.log(`Webtoon team: ${data.tasks.length} tasks, ${data.total_rounds} review rounds`);
    console.log(`Final output (${data.final_output.length} chars): ${data.final_output.substring(0, 150)}...`);
  }, 60000); // 60s timeout for LLM calls

  test('Webtoon team with nonexistent artist returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/webtoon/produce`, {
      data: {
        artist: 'nonexistent_xyz',
        reviewer: 'allegro',
        series_title: 'Test',
        episode_number: 1,
      },
    });
    expect(res.status()).toBe(404);
  });

  test('Webtoon team with nonexistent reviewer returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/webtoon/produce`, {
      data: {
        artist: 'adagio',
        reviewer: 'nonexistent_xyz',
        series_title: 'Test',
        episode_number: 1,
      },
    });
    expect(res.status()).toBe(404);
  });

  test('Webtoon team with previous_summary maintains continuity', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/webtoon/produce`, {
      data: {
        artist: 'adagio',
        reviewer: 'allegro',
        series_title: 'The Tower of Dreams',
        episode_number: 2,
        previous_summary: 'In Episode 1, the hero discovered a hidden portal beneath the ancient tower.',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.final_output.length).toBeGreaterThan(100);
    expect(data.tasks.length).toBeGreaterThanOrEqual(2);
    console.log(`Episode 2 continuity test: ${data.final_output.substring(0, 150)}...`);
  }, 60000);
});
