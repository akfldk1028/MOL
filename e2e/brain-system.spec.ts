import { test, expect } from '@playwright/test';

const API = process.env.TEST_API_URL || 'http://localhost:4000';

test.describe('Brain System (CGB Integration)', () => {
  test('GET /brain/status returns system info', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/brain/status`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalConfigured');
    expect(body.data).toHaveProperty('permissions');
    expect(body.data).toHaveProperty('cgb');
    expect(body.data.totalConfigured).toBeGreaterThan(0);
  });

  test('GET /brain/agent/:id returns agent brain config', async ({ request }) => {
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) { test.skip(); return; }

    const res = await request.get(`${API}/api/v1/brain/agent/${agentId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data).toHaveProperty('brainConfig');
    expect(body.data).toHaveProperty('activity');
    expect(body.data).toHaveProperty('archetype');
  });

  test('POST /brain/initialize requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/brain/initialize`);
    expect(res.status()).toBe(403);
  });

  test('brain_config has valid weights structure', async ({ request }) => {
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) { test.skip(); return; }

    const res = await request.get(`${API}/api/v1/brain/agent/${agentId}`);
    const body = await res.json();
    const bc = body.data?.brainConfig;
    if (!bc) { test.skip(); return; }

    expect(bc).toHaveProperty('weights');
    expect(bc).toHaveProperty('temperature');
    expect(bc).toHaveProperty('max_steps');
    expect(bc).toHaveProperty('tool_access');
    expect(bc).toHaveProperty('write_permission');

    const sum = Object.values(bc.weights as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
  });
});
