import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 4: A2A Team Collaboration
// Fan-out Research + Structured Debate
// ═══════════════════════════════════════════════

test.describe('A2A: Research Team — Fan-out/Fan-in', () => {

  test('POST /a2a/teams/research runs parallel investigation', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/research`, {
      data: {
        researchers: ['adagio', 'allegro', 'arbiter'],
        synthesizer: 'adagio',
        topic: 'The future of AI-generated art',
        depth: 'brief',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.pattern).toBe('fan-out');
    expect(data.researcher_count).toBe(3);
    // 3 researchers + 1 synthesizer = 4 tasks
    expect(data.tasks.length).toBe(4);

    // All tasks completed
    for (const t of data.tasks) {
      expect(t.status).toBe('completed');
    }

    // Final synthesis should be substantial
    expect(data.final_output.length).toBeGreaterThan(50);

    console.log(`Research: ${data.tasks.length} tasks, synthesis: ${data.final_output.substring(0, 150)}...`);
  }, 60000);

  test('Research with no topic returns 400', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/research`, {
      data: { researchers: ['adagio'], synthesizer: 'adagio' },
    });
    expect(res.status()).toBe(400);
  });
});


test.describe('A2A: Debate Team — Structured Argumentation', () => {

  test('POST /a2a/teams/debate runs 2-round debate with judge', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/debate`, {
      data: {
        pro: 'adagio',
        con: 'allegro',
        judge: 'arbiter',
        topic: 'Is AI creativity genuine or just imitation?',
        rounds: 2,
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.pattern).toBe('debate');
    expect(data.rounds).toBe(2);
    // 2 rounds * 2 debaters + 1 judge = 5 tasks
    expect(data.tasks.length).toBe(5);

    // Check roles
    const roles = data.tasks.map((t: any) => t.role);
    expect(roles.filter((r: string) => r === 'debater_pro').length).toBe(2);
    expect(roles.filter((r: string) => r === 'debater_con').length).toBe(2);
    expect(roles.filter((r: string) => r === 'judge').length).toBe(1);

    // All completed
    for (const t of data.tasks) {
      expect(t.status).toBe('completed');
    }

    // Judge verdict
    expect(data.final_output.length).toBeGreaterThan(50);

    console.log(`Debate: ${data.tasks.length} tasks, verdict: ${data.final_output.substring(0, 150)}...`);
  }, 60000);

  test('Debate with no topic returns 400', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/debate`, {
      data: { pro: 'adagio', con: 'allegro', judge: 'arbiter' },
    });
    expect(res.status()).toBe(400);
  });

  test('Debate with nonexistent agent returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/teams/debate`, {
      data: { pro: 'nonexistent_xyz', con: 'allegro', judge: 'arbiter', topic: 'Test' },
    });
    expect(res.status()).toBe(404);
  });
});
