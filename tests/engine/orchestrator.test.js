const { Orchestrator, Team, parseTaskSpecs, executeWithRetry } = require('../../src/backend/engine/open-multi-agent/orchestrator');
const { createTask } = require('../../src/backend/engine/open-multi-agent/task-queue');

describe('Orchestrator', () => {
  test('createTeam registers agents', () => {
    const orch = new Orchestrator();
    const team = orch.createTeam('test', {
      agents: [
        { name: 'writer', systemPrompt: 'Write stories', run: async () => ({ success: true, output: 'ok' }) },
      ],
    });
    expect(team.getAgents().length).toBe(1);
    expect(team.getAgent('writer')).toBeTruthy();
  });

  test('runTasks executes in dependency order', async () => {
    const orch = new Orchestrator({ maxConcurrency: 1 });
    const order = [];
    const team = orch.createTeam('seq', {
      agents: [
        { name: 'a1', run: async () => { order.push('a1'); return { success: true, output: 'done1' }; } },
        { name: 'a2', run: async () => { order.push('a2'); return { success: true, output: 'done2' }; } },
        { name: 'a3', run: async () => { order.push('a3'); return { success: true, output: 'done3' }; } },
      ],
    });

    const t1 = createTask({ title: 'step1', description: '', assignee: 'a1' });
    const t2 = createTask({ title: 'step2', description: '', assignee: 'a2', dependsOn: [t1.id] });
    const t3 = createTask({ title: 'step3', description: '', assignee: 'a3', dependsOn: [t2.id] });

    const result = await orch.runTasks(team, [t1, t2, t3]);
    expect(result.success).toBe(true);
    expect(order).toEqual(['a1', 'a2', 'a3']);
    expect(result.results.size).toBe(3);
  });

  test('runTasks handles agent failure gracefully', async () => {
    const orch = new Orchestrator();
    const team = orch.createTeam('fail', {
      agents: [
        { name: 'bad', run: async () => { throw new Error('boom'); } },
      ],
    });

    const t = createTask({ title: 'fail-task', description: '', assignee: 'bad' });
    const result = await orch.runTasks(team, [t]);
    expect(result.success).toBe(false);
  });

  test('shared memory persists across tasks', async () => {
    const orch = new Orchestrator();
    const team = orch.createTeam('mem', {
      agents: [
        { name: 'producer', run: async () => ({ success: true, output: 'data-from-producer' }) },
        { name: 'consumer', run: async (prompt) => ({ success: true, output: `got: ${prompt.includes('data-from-producer')}` }) },
      ],
    });

    const t1 = createTask({ title: 'produce', description: 'Generate data', assignee: 'producer' });
    const t2 = createTask({ title: 'consume', description: 'Use data', assignee: 'consumer', dependsOn: [t1.id] });

    const result = await orch.runTasks(team, [t1, t2]);
    expect(result.success).toBe(true);
    // consumer should see producer's output in shared memory summary
    const consumerResult = result.results.get(t2.id);
    expect(consumerResult.output).toContain('true');
  });
});

describe('parseTaskSpecs', () => {
  test('parses JSON fenced block', () => {
    const raw = 'Here is the plan:\n```json\n[{"title":"outline","description":"make outline","assignee":"writer"}]\n```';
    const specs = parseTaskSpecs(raw);
    expect(specs).toHaveLength(1);
    expect(specs[0].title).toBe('outline');
    expect(specs[0].assignee).toBe('writer');
  });

  test('parses bare JSON array', () => {
    const raw = '[{"title":"a","description":"b"},{"title":"c","description":"d"}]';
    const specs = parseTaskSpecs(raw);
    expect(specs).toHaveLength(2);
  });

  test('returns null for invalid input', () => {
    expect(parseTaskSpecs('no json here')).toBeNull();
    expect(parseTaskSpecs('')).toBeNull();
  });
});

describe('executeWithRetry', () => {
  test('succeeds on first try', async () => {
    const task = { maxRetries: 2, retryDelayMs: 10 };
    const result = await executeWithRetry(() => Promise.resolve({ success: true, output: 'ok' }), task);
    expect(result.success).toBe(true);
  });

  test('retries on failure', async () => {
    let attempts = 0;
    const task = { maxRetries: 2, retryDelayMs: 10 };
    const result = await executeWithRetry(() => {
      attempts++;
      if (attempts < 3) return Promise.resolve({ success: false, output: 'fail' });
      return Promise.resolve({ success: true, output: 'ok' });
    }, task);
    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  test('exhausts retries', async () => {
    const task = { maxRetries: 1, retryDelayMs: 10 };
    const result = await executeWithRetry(() => Promise.reject(new Error('always fail')), task);
    expect(result.success).toBe(false);
    expect(result.output).toContain('always fail');
  });
});
