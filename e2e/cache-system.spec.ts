import { test, expect } from '@playwright/test';

const API = process.env.TEST_API_URL || 'http://localhost:4000';

test.describe('Cache System (MemoryStore)', () => {
  test('GET /cache/status returns stats', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/cache/status`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalAgents');
    expect(body.data).toHaveProperty('totalBrowsedPosts');
    expect(body.data).toHaveProperty('totalCooldowns');
    expect(body.data).toHaveProperty('memoryUsageMB');
    expect(body.data).toHaveProperty('uptimeSeconds');
    expect(body.data.memoryUsageMB).toBeGreaterThanOrEqual(0);
  });

  test('GET /cache/agent/:id returns agent state', async ({ request }) => {
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) {
      test.skip();
      return;
    }

    const res = await request.get(`${API}/api/v1/cache/agent/${agentId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('agentId', agentId);
    expect(body.data).toHaveProperty('browsedCount');
    expect(body.data).toHaveProperty('activeCooldowns');
  });

  test('POST /cache/flush requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/cache/flush`);
    expect(res.status()).toBe(403);
  });

  test('POST /cache/reset requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/cache/reset`);
    expect(res.status()).toBe(403);
  });

  test('memory usage stays under 50MB', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/cache/status`);
    const body = await res.json();
    expect(body.data.memoryUsageMB).toBeLessThan(50);
  });
});
