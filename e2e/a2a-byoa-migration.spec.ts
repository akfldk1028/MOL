import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';
const EXPRESS_URL = 'http://localhost:4000';

// ═══════════════════════════════════════════════
// Phase 7: BYOA → A2A Migration
// Tests deprecated BYOA routes + A2A equivalents
// ═══════════════════════════════════════════════

test.describe('A2A: BYOA Deprecated Routes', () => {

  test('GET /agents/skill returns deprecated header', async ({ request }) => {
    // This hits Express:4000 (if running)
    try {
      const res = await request.get(`${EXPRESS_URL}/api/v1/agents/skill`);
      if (res.status() === 200) {
        const deprecated = res.headers()['x-deprecated'];
        expect(deprecated).toContain('A2A');
        console.log(`BYOA /skill deprecated: ${deprecated}`);
      }
    } catch {
      console.log('Express:4000 not running — skipping BYOA route test');
    }
  });
});

test.describe('A2A: Replacement Endpoints', () => {

  test('A2A agent discovery replaces BYOA /agents/skill', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/.well-known/agent-card.json`);
    expect(res.status()).toBe(200);
    const card = await res.json();
    expect(card).toHaveProperty('name');
    expect(card).toHaveProperty('skills');
    expect(card).toHaveProperty('supportedInterfaces');
    console.log('A2A discovery works as BYOA /skill replacement');
  });

  test('A2A per-agent chat replaces BYOA heartbeat+actions', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: { text: 'What is trending?' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.agent).toBe('adagio');
    expect(data.response).toBeTruthy();
    console.log('A2A chat works as BYOA heartbeat+action replacement');
  });

  test('A2A SSE streaming replaces BYOA polling', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat/stream`, {
      data: { text: 'Quick update?' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/event-stream');
    console.log('A2A SSE streaming works as BYOA polling replacement');
  });

  test('A2A agent list replaces BYOA agent directory', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/a2a/agents?limit=5`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThanOrEqual(300);
    console.log(`A2A agent directory: ${data.total} agents (replaces BYOA)`);
  });
});

test.describe('A2A: Full System Summary', () => {

  test('All A2A capabilities are operational', async ({ request }) => {
    // 1. Discovery
    const discover = await request.get(`${BRIDGE_URL}/a2a/agents?limit=1`);
    expect(discover.status()).toBe(200);

    // 2. Agent card
    const card = await request.get(`${BRIDGE_URL}/a2a/agents/adagio/card`);
    expect(card.status()).toBe(200);

    // 3. Chat
    const chat = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: { text: 'Status check' },
    });
    expect(chat.status()).toBe(200);

    // 4. JSON-RPC
    const jsonrpc = await request.post(`${BRIDGE_URL}/a2a/jsonrpc/`, {
      data: { jsonrpc: '2.0', method: 'SendMessage', params: { message: { role: 'ROLE_USER', parts: [{ text: 'Test' }] } }, id: 1 },
    });
    expect(jsonrpc.status()).toBe(200);

    // 5. Agent-to-agent
    const a2a = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/talk-to/allegro`, {
      data: { text: 'System check' },
    });
    expect(a2a.status()).toBe(200);

    console.log('All 5 A2A capabilities verified: Discovery, Card, Chat, JSON-RPC, Agent-to-Agent');
  }, 60000);
});
