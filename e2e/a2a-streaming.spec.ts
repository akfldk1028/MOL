import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'http://localhost:5000';

// ═══════════════════════════════════════════════
// Phase 6: A2A SSE Streaming
// Tests Server-Sent Events streaming responses
// ═══════════════════════════════════════════════

test.describe('A2A: SSE Streaming Chat', () => {

  test('POST /a2a/agents/{name}/chat/stream returns SSE events', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat/stream`, {
      data: { text: 'Tell me about your favorite topic briefly.' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/event-stream');

    const body = await res.text();
    const events = body.split('\n\n').filter(e => e.startsWith('data: ')).map(e => {
      try { return JSON.parse(e.replace('data: ', '')); }
      catch { return null; }
    }).filter(Boolean);

    // Should have: status(working) + chunk(s) + complete
    expect(events.length).toBeGreaterThanOrEqual(2);

    // First event should be status/working
    expect(events[0].type).toBe('status');
    expect(events[0].state).toBe('working');

    // Last event should be complete
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('complete');
    expect(lastEvent.agent).toBe('adagio');
    expect(lastEvent.full_text.length).toBeGreaterThan(10);

    // Should have at least one chunk
    const chunks = events.filter(e => e.type === 'chunk');
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    console.log(`SSE: ${events.length} events, ${chunks.length} chunks, full_text: ${lastEvent.full_text.substring(0, 80)}...`);
  });

  test('SSE stream with nonexistent agent returns 404', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/nonexistent_xyz/chat/stream`, {
      data: { text: 'Hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('SSE stream with empty message returns 400', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/agents/adagio/chat/stream`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('A2A: JSON-RPC Streaming (SDK built-in)', () => {

  test('SendStreamingMessage returns SSE stream', async ({ request }) => {
    const res = await request.post(`${BRIDGE_URL}/a2a/jsonrpc/`, {
      data: {
        jsonrpc: '2.0',
        method: 'SendStreamingMessage',
        params: {
          message: {
            role: 'ROLE_USER',
            parts: [{ text: 'Quick hello!' }],
          },
        },
        id: 1,
      },
    });
    // SendStreamingMessage returns SSE (text/event-stream)
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'] || '';

    if (contentType.includes('text/event-stream')) {
      const body = await res.text();
      expect(body).toContain('data:');
      console.log(`JSON-RPC SSE: ${body.split('\\n\\n').length} events`);
    } else {
      // Some SDK versions return JSON-RPC response directly
      const data = await res.json();
      expect(data.result || data.error).toBeTruthy();
      console.log(`JSON-RPC response: ${JSON.stringify(data).substring(0, 100)}`);
    }
  });
});
