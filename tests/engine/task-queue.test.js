const { TaskQueue, createTask, getTaskDependencyOrder, validateTaskDependencies } = require('../../src/backend/engine/open-multi-agent/task-queue');

describe('TaskQueue', () => {
  let queue;

  beforeEach(() => { queue = new TaskQueue(); });

  test('creates tasks with pending status', () => {
    const t = createTask({ title: 'test', description: 'desc' });
    expect(t.status).toBe('pending');
    expect(t.id).toBeDefined();
    expect(t.title).toBe('test');
  });

  test('adds tasks and tracks size', () => {
    queue.add(createTask({ title: 'a', description: '' }));
    queue.add(createTask({ title: 'b', description: '' }));
    expect(queue.size()).toBe(2);
  });

  test('blocks tasks with unresolved dependencies', () => {
    const t1 = createTask({ title: 'first', description: '' });
    const t2 = createTask({ title: 'second', description: '', dependsOn: [t1.id] });
    queue.addBatch([t1, t2]);
    expect(queue.getByStatus('pending').length).toBe(1);
    expect(queue.getByStatus('blocked').length).toBe(1);
  });

  test('unblocks dependents when completed', () => {
    const t1 = createTask({ title: 'first', description: '' });
    const t2 = createTask({ title: 'second', description: '', dependsOn: [t1.id] });
    const t3 = createTask({ title: 'third', description: '', dependsOn: [t2.id] });
    queue.addBatch([t1, t2, t3]);

    queue.complete(t1.id, 'done');
    expect(queue.getByStatus('pending').map(t => t.title)).toEqual(['second']);

    queue.complete(t2.id, 'done');
    expect(queue.getByStatus('pending').map(t => t.title)).toEqual(['third']);
  });

  test('cascades failure to dependents', () => {
    const t1 = createTask({ title: 'first', description: '' });
    const t2 = createTask({ title: 'second', description: '', dependsOn: [t1.id] });
    const t3 = createTask({ title: 'third', description: '', dependsOn: [t2.id] });
    queue.addBatch([t1, t2, t3]);

    queue.fail(t1.id, 'error');
    expect(queue.getByStatus('failed').length).toBe(3);
  });

  test('emits events', () => {
    const events = [];
    queue.on('task:ready', (t) => events.push(`ready:${t.title}`));
    queue.on('task:complete', (t) => events.push(`complete:${t.title}`));
    queue.on('all:complete', () => events.push('all_done'));

    const t = createTask({ title: 'solo', description: '' });
    queue.add(t);
    queue.complete(t.id, 'ok');

    expect(events).toEqual(['ready:solo', 'complete:solo', 'all_done']);
  });

  test('isComplete returns true when all done', () => {
    const t = createTask({ title: 'x', description: '' });
    queue.add(t);
    expect(queue.isComplete()).toBe(false);
    queue.complete(t.id);
    expect(queue.isComplete()).toBe(true);
  });
});

describe('getTaskDependencyOrder', () => {
  test('topological sort respects dependencies', () => {
    const t1 = createTask({ title: 'outline', description: '' });
    const t2 = createTask({ title: 'plan', description: '', dependsOn: [t1.id] });
    const t3 = createTask({ title: 'write', description: '', dependsOn: [t2.id] });
    const sorted = getTaskDependencyOrder([t3, t1, t2]); // input shuffled
    expect(sorted.map(t => t.title)).toEqual(['outline', 'plan', 'write']);
  });
});

describe('validateTaskDependencies', () => {
  test('detects self-dependency', () => {
    const t = createTask({ title: 'self', description: '' });
    t.dependsOn = [t.id];
    const { valid, errors } = validateTaskDependencies([t]);
    expect(valid).toBe(false);
    expect(errors[0]).toContain('depends on itself');
  });

  test('detects unknown dependency', () => {
    const t = createTask({ title: 'orphan', description: '', dependsOn: ['nonexistent'] });
    const { valid, errors } = validateTaskDependencies([t]);
    expect(valid).toBe(false);
    expect(errors[0]).toContain('unknown dependency');
  });

  test('valid graph passes', () => {
    const t1 = createTask({ title: 'a', description: '' });
    const t2 = createTask({ title: 'b', description: '', dependsOn: [t1.id] });
    const { valid } = validateTaskDependencies([t1, t2]);
    expect(valid).toBe(true);
  });
});
