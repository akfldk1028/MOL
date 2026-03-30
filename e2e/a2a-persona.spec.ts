import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 1: A2A Agent Persona Chat
// Tests per-agent A2A endpoints with SOUL.md persona loading
// ═══════════════════════════════════════════════

test.describe('A2A: Agent Discovery', () => {

  test('GET /a2a/agents returns 334 agents', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/a2a/agents?limit=5`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThanOrEqual(300);
    expect(data.agents.length).toBeLessThanOrEqual(5);
    console.log(`Total agents: ${data.total}`);
  });

  test('GET /a2a/agents/{name}/card returns valid AgentCard', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/a2a/agents/adagio/card`);
    expect(res.status()).toBe(200);
    const card = await res.json();
    expect(card).toHaveProperty('name');
    expect(card).toHaveProperty('description');
    expect(card).toHaveProperty('skills');
    expect(card).toHaveProperty('supportedInterfaces');
    expect(card).toHaveProperty('provider');
    expect(card.provider.organization).toBe('Clickaround');
    expect(card.skills.length).toBeGreaterThanOrEqual(1);
    console.log(`Agent: ${card.name}, skills: ${card.skills.map((s: any) => s.id).join(', ')}`);
  });

  test('GET /a2a/agents/nonexistent/card returns 404', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/a2a/agents/nonexistent_agent_xyz/card`);
    expect(res.status()).toBe(404);
  });

  test('GET /.well-known/agent-card.json returns directory card', async ({ request }) => {
    const res = await request.get(`${BRIDGE_URL}/.well-known/agent-card.json`);
    expect(res.status()).toBe(200);
    const card = await res.json();
    expect(card).toHaveProperty('name');
    expect(card).toHaveProperty('supportedInterfaces');
  });
});


test.describe('A2A: Per-Agent Persona Chat', () => {

  test('POST /a2a/agents/{name}/chat returns persona response', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: {
        message: {
          role: 'user',
          parts: [{ text: 'Tell me briefly about yourself.' }],
        },
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.agent).toBe('adagio');
    expect(data.response).toBeTruthy();
    expect(data.response.length).toBeGreaterThan(10);
    expect(data.persona_loaded).toBe(true);
    console.log(`Adagio response (${data.response.length} chars): ${data.response.substring(0, 100)}...`);
  });

  test('POST /a2a/agents/{name}/chat with text shorthand', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: { text: 'What are your interests?' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.agent).toBe('adagio');
    expect(data.response).toBeTruthy();
  });

  test('POST /a2a/agents/nonexistent/chat returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/nonexistent_xyz/chat`, {
      data: { text: 'Hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('POST /a2a/agents/{name}/chat with empty message returns 400', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});


test.describe('A2A: JSON-RPC SendMessage', () => {

  test('SendMessage returns TASK_STATE_COMPLETED', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/jsonrpc/`, {
      data: {
        jsonrpc: '2.0',
        method: 'SendMessage',
        params: {
          message: {
            role: 'ROLE_USER',
            parts: [{ text: 'Hello!' }],
          },
        },
        id: 1,
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(data.result.task).toBeTruthy();
    expect(data.result.task.status.state).toBe('TASK_STATE_COMPLETED');
    console.log(`Task ${data.result.task.id}: ${data.result.task.status.state}`);
  });
});
