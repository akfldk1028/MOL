import { test, expect } from '@playwright/test';

const API = 'http://localhost:4000/api/v1';

// ═══════════════════════════════════════════════
// 1. HR API ENDPOINTS
// ═══════════════════════════════════════════════

test.describe('HR API: Organization', () => {

  test('GET /hr/organization returns full org structure', async ({ request }) => {
    const res = await request.get(`${API}/hr/organization`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalAgents).toBeGreaterThan(0);
    expect(data.organization).toBeDefined();

    const depts = Object.keys(data.organization);
    expect(depts.length).toBeGreaterThanOrEqual(4);
    console.log(`Organization: ${data.totalAgents} agents, ${depts.length} divisions`);

    // Each division has teams
    for (const dept of depts) {
      const teams = Object.keys(data.organization[dept]);
      expect(teams.length).toBeGreaterThan(0);
      for (const team of teams) {
        const agents = data.organization[dept][team];
        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBeGreaterThan(0);
        // Each agent has HR fields
        const a = agents[0];
        expect(a).toHaveProperty('level');
        expect(a).toHaveProperty('department');
        expect(a).toHaveProperty('team');
        expect(a).toHaveProperty('title');
        expect([1, 2, 3, 4]).toContain(a.level);
      }
    }
  });

  test('GET /hr/organization?compact=true returns compact format', async ({ request }) => {
    const res = await request.get(`${API}/hr/organization?compact=true`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.compact).toBe(true);
    expect(data.totalAgents).toBeGreaterThan(0);

    const depts = Object.keys(data.organization);
    expect(depts.length).toBeGreaterThanOrEqual(4);

    // Compact format: { leaders: [], seniorCount, juniorCount }
    for (const dept of depts) {
      for (const team of Object.keys(data.organization[dept])) {
        const teamData = data.organization[dept][team];
        expect(teamData).toHaveProperty('leaders');
        expect(teamData).toHaveProperty('seniorCount');
        expect(teamData).toHaveProperty('juniorCount');
        expect(Array.isArray(teamData.leaders)).toBe(true);
        // Leaders should be L1 or L2 only
        for (const leader of teamData.leaders) {
          expect(leader.level).toBeLessThanOrEqual(2);
        }
      }
    }
    console.log(`Compact org: ${data.totalAgents} agents, compact payload`);
  });
});

test.describe('HR API: Dashboard', () => {

  test('GET /hr/dashboard returns dashboard data', async ({ request }) => {
    const res = await request.get(`${API}/hr/dashboard`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('gradeDistribution');
    expect(data).toHaveProperty('recentChanges');
    expect(data).toHaveProperty('divisionStats');
    expect(data).toHaveProperty('directiveStats');

    // divisionStats should have all departments
    expect(data.divisionStats.length).toBeGreaterThanOrEqual(4);
    for (const div of data.divisionStats) {
      expect(div).toHaveProperty('department');
      expect(div).toHaveProperty('agent_count');
      expect(Number(div.agent_count)).toBeGreaterThan(0);
    }

    // directiveStats should have counts
    expect(data.directiveStats).toHaveProperty('total');
    expect(data.directiveStats).toHaveProperty('approved');
    expect(data.directiveStats).toHaveProperty('rejected');
    expect(data.directiveStats).toHaveProperty('active');
    console.log(`Dashboard: divisionStats=${data.divisionStats.length}, directives total=${data.directiveStats.total}`);
  });
});

test.describe('HR API: Agent Evaluations & Directives', () => {

  let testAgentId: string;

  test.beforeAll(async ({ request }) => {
    // Get a random agent ID
    const res = await request.get(`${API}/hr/organization`);
    const data = await res.json();
    const firstDept = Object.keys(data.organization)[0];
    const firstTeam = Object.keys(data.organization[firstDept])[0];
    testAgentId = data.organization[firstDept][firstTeam][0].id;
  });

  test('GET /hr/evaluations/:agentId returns evaluation history', async ({ request }) => {
    const res = await request.get(`${API}/hr/evaluations/${testAgentId}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('evaluations');
    expect(Array.isArray(data.evaluations)).toBe(true);
    console.log(`Agent ${testAgentId}: ${data.evaluations.length} evaluations`);
  });

  test('GET /hr/directives/:agentId returns directive history', async ({ request }) => {
    const res = await request.get(`${API}/hr/directives/${testAgentId}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('issued');
    expect(data).toHaveProperty('received');
    expect(Array.isArray(data.issued)).toBe(true);
    expect(Array.isArray(data.received)).toBe(true);
    console.log(`Agent ${testAgentId}: ${data.issued.length} issued, ${data.received.length} received`);
  });
});

test.describe('HR API: Admin endpoints', () => {

  test('POST /hr/evaluate without secret returns 401/403', async ({ request }) => {
    const res = await request.post(`${API}/hr/evaluate`, {
      data: { date: '2026-03-30' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /hr/assign-all without secret returns 401/403', async ({ request }) => {
    const res = await request.post(`${API}/hr/assign-all`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════
// 2. NEXT.JS PROXY ROUTES
// ═══════════════════════════════════════════════

test.describe('HR Proxy Routes', () => {

  test('GET /api/hr/organization proxies correctly', async ({ request }) => {
    const res = await request.get('/api/hr/organization');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalAgents).toBeGreaterThan(0);
  });

  test('GET /api/hr/dashboard proxies correctly', async ({ request }) => {
    const res = await request.get('/api/hr/dashboard');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('divisionStats');
  });
});

// ═══════════════════════════════════════════════
// 3. FRONTEND PAGES
// ═══════════════════════════════════════════════

test.describe('HR Frontend: Organization Page', () => {

  test('/organization loads React Flow org chart', async ({ page }) => {
    await page.goto('/organization');

    // Wait for data to load
    await page.waitForSelector('[data-testid="rf__wrapper"], .react-flow', { timeout: 15000 });

    // Check React Flow rendered
    const flow = page.locator('.react-flow');
    await expect(flow).toBeVisible();

    // Check root node exists (use last() to avoid matching sidebar logo)
    await expect(page.locator('.react-flow').getByText('Clickaround')).toBeVisible();

    // Check divisions exist
    await expect(page.getByText('Creative Studio')).toBeVisible();
    await expect(page.getByText('Research Lab')).toBeVisible();
    await expect(page.getByText('Community & Social')).toBeVisible();
    await expect(page.getByText('Platform Ops')).toBeVisible();

    // Check controls exist
    await expect(page.getByRole('button', { name: 'Zoom In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fit View' })).toBeVisible();

    // Check MiniMap exists
    await expect(page.getByRole('img', { name: 'Mini Map' })).toBeVisible();

    console.log('Organization page: React Flow rendered with all divisions');
  });

  test('/organization shows team nodes', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForSelector('.react-flow', { timeout: 15000 });

    // Wait for nodes to render
    await page.waitForTimeout(3000);

    // Check team nodes
    const teamTexts = ['discussion', 'fiction', 'media', 'infrastructure', 'critique', 'trend analysis'];
    for (const team of teamTexts) {
      const el = page.getByText(team, { exact: false });
      const count = await el.count();
      expect(count).toBeGreaterThan(0);
    }

    console.log('Organization page: All team nodes visible');
  });

  test('/organization shows agent leader cards', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForSelector('.react-flow', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check that Lead badges exist
    const leadBadges = page.getByText('Lead', { exact: true });
    const leadCount = await leadBadges.count();
    expect(leadCount).toBeGreaterThan(0);
    console.log(`Organization page: ${leadCount} Lead badges visible`);
  });
});

test.describe('HR Frontend: Dashboard Page', () => {

  test('/hr-dashboard loads grade distribution', async ({ page }) => {
    await page.goto('/hr-dashboard');

    // Wait for data
    await expect(page.getByText('HR Dashboard')).toBeVisible({ timeout: 10000 });

    // Grade cards
    for (const grade of ['S', 'A', 'B', 'C', 'D']) {
      await expect(page.getByText(grade, { exact: true }).first()).toBeVisible();
    }

    console.log('HR Dashboard: Grade distribution visible');
  });

  test('/hr-dashboard loads division performance', async ({ page }) => {
    await page.goto('/hr-dashboard');
    await expect(page.getByText('Division Performance')).toBeVisible({ timeout: 10000 });

    // All 4 divisions should be listed
    await expect(page.getByText('Research Lab')).toBeVisible();
    await expect(page.getByText('Creative Studio')).toBeVisible();
    await expect(page.getByText('Platform Ops')).toBeVisible();
    await expect(page.getByText('Community & Social')).toBeVisible();

    console.log('HR Dashboard: Division performance rankings visible');
  });

  test('/hr-dashboard loads directive stats', async ({ page }) => {
    await page.goto('/hr-dashboard');
    await expect(page.getByText('Total Directives')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Approved')).toBeVisible();
    await expect(page.getByText('Rejected')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();

    console.log('HR Dashboard: Directive stats visible');
  });

  test('/hr-dashboard loads recent changes section', async ({ page }) => {
    await page.goto('/hr-dashboard');
    await expect(page.getByText('Recent Promotions & Changes')).toBeVisible({ timeout: 10000 });

    console.log('HR Dashboard: Recent changes section visible');
  });
});

// ═══════════════════════════════════════════════
// 4. DATA INTEGRITY
// ═══════════════════════════════════════════════

test.describe('HR Data Integrity', () => {

  test('All agents have valid HR assignments', async ({ request }) => {
    const res = await request.get(`${API}/hr/organization`);
    const data = await res.json();

    let totalInOrg = 0;
    const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const dept of Object.values(data.organization) as Record<string, any>[]) {
      for (const agents of Object.values(dept) as any[][]) {
        for (const agent of agents) {
          totalInOrg++;
          expect(agent.department).toBeTruthy();
          expect(agent.team).toBeTruthy();
          expect(agent.level).toBeGreaterThanOrEqual(1);
          expect(agent.level).toBeLessThanOrEqual(4);
          expect(agent.title).toBeTruthy();
          levelCounts[agent.level as keyof typeof levelCounts]++;
        }
      }
    }

    expect(totalInOrg).toBe(data.totalAgents);
    console.log(`Data integrity: ${totalInOrg} agents — VP:${levelCounts[1]} Lead:${levelCounts[2]} Senior:${levelCounts[3]} Junior:${levelCounts[4]}`);

    // Should have at least some leaders
    expect(levelCounts[2]).toBeGreaterThan(0);
    expect(levelCounts[3]).toBeGreaterThan(0);
    expect(levelCounts[4]).toBeGreaterThan(0);
  });

  test('Compact and full endpoints return same total', async ({ request }) => {
    const fullRes = await request.get(`${API}/hr/organization`);
    const compactRes = await request.get(`${API}/hr/organization?compact=true`);
    const fullData = await fullRes.json();
    const compactData = await compactRes.json();

    expect(fullData.totalAgents).toBe(compactData.totalAgents);
    console.log(`Consistency: full=${fullData.totalAgents}, compact=${compactData.totalAgents}`);
  });

  test('Division stats match organization data', async ({ request }) => {
    const orgRes = await request.get(`${API}/hr/organization`);
    const dashRes = await request.get(`${API}/hr/dashboard`);
    const orgData = await orgRes.json();
    const dashData = await dashRes.json();

    for (const divStat of dashData.divisionStats) {
      const dept = divStat.department;
      const orgDept = orgData.organization[dept];
      expect(orgDept).toBeDefined();
      const orgCount = Object.values(orgDept).flat().length;
      expect(Number(divStat.agent_count)).toBe(orgCount);
    }
    console.log('Data integrity: Division stats match org data');
  });
});
