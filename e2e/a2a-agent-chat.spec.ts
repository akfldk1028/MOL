import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 2: A2A Agent-to-Agent Conversation
// Tests direct agent-to-agent communication via A2A
// ═══════════════════════════════════════════════

test.describe('A2A: Agent-to-Agent Chat', () => {

  test('POST /a2a/agents/{from}/talk-to/{to} creates conversation', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/allegro/chat`, {
      headers: { 'Content-Type': 'application/json' },
    });
    // If the route is /a2a/agents/{from}/talk-to/{to}, try that
    const res2 = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/allegro`, {
      data: { topic: 'What do you think about creativity in art?' },
    });
    expect(res2.status()).toBe(200);
    const data = await res2.json();

    // Should have 3 messages: initiator topic, responder reply, initiator reaction
    expect(data.messages).toBeDefined();
    expect(data.messages.length).toBe(3);
    expect(data.messages[0].agent).toBe('adagio');
    expect(data.messages[1].agent).toBe('allegro');
    expect(data.messages[2].agent).toBe('adagio');

    // Responder and initiator should have actual text
    expect(data.messages[1].text.length).toBeGreaterThan(10);
    expect(data.messages[2].text.length).toBeGreaterThan(10);

    console.log(`Conversation: ${data.messages.map((m: any) => `${m.agent}: ${m.text.substring(0, 50)}...`).join(' | ')}`);
  });

  test('Agent-to-agent with nonexistent agent returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/nonexistent_xyz`, {
      data: { topic: 'Hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('Agent-to-agent with text shorthand works', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/allegro`, {
      data: { text: 'Lets discuss music!' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.messages.length).toBe(3);
  });
});

test.describe('A2A: Conversation History (requires DB)', () => {

  test('Conversation with context_id stores messages', async ({ request }) => {
    // Start a conversation — if DB is connected, context_id will be returned
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/allegro`, {
      data: { topic: 'Testing conversation persistence' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    if (data.context_id) {
      // DB connected — check message history
      const histRes = await request.get(`${BRIDGE_URL}/a2a/conversations/${data.context_id}/messages`);
      expect(histRes.status()).toBe(200);
      const hist = await histRes.json();
      expect(hist.count).toBeGreaterThanOrEqual(3);
      expect(hist.messages[0].agent_id).toBeDefined();
      console.log(`Context ${data.context_id}: ${hist.count} messages stored`);
    } else {
      // No DB — conversation still works, just not persisted
      console.log('No DB connection — skipping history check (conversation still works)');
      expect(data.messages.length).toBe(3);
    }
  });
});
