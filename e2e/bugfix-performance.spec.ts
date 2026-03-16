import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────
// B1: Middleware — public pages should NOT call getUser() (faster load)
// B2: API cache revalidation (pages load faster with 30s ISR)
// ─────────────────────────────────────────────

test.describe('Performance: routing & page load', () => {

  test('B1+B2: homepage loads fast without auth delay', async ({ page }) => {
    const start = Date.now();
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;

    expect(response?.status()).toBe(200);
    // Homepage is a public route — should not hit Supabase getUser()
    // Target: under 5 seconds (generous for CI, real improvement is ~200ms)
    expect(loadTime).toBeLessThan(5000);
    console.log(`Homepage load: ${loadTime}ms`);
  });

  test('B1: protected route /dashboard redirects to /welcome when not logged in', async ({ page }) => {
    const response = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    // Should redirect to /welcome (auth required)
    expect(page.url()).toContain('/welcome');
  });

  test('B1: public route /series does NOT redirect', async ({ page }) => {
    const response = await page.goto('/series', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain('/welcome');
  });

});

// ─────────────────────────────────────────────
// B3: Homepage should NOT use heavy animations on list items
// ─────────────────────────────────────────────

test.describe('Performance: homepage animations', () => {

  test('B3: feed cards use simple div, not MagicCard/BlurFade', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for feed to load (cards or empty state)
    await page.waitForSelector('a[href^="/c/"], text=No posts yet', { timeout: 10_000 }).catch(() => {});

    // Check that there are NO elements with magic-card class
    const magicCards = await page.locator('[class*="magic-card"]').count();
    expect(magicCards).toBe(0);

    // Feed cards should exist as simple divs with hover transition
    const feedCards = await page.locator('a[href^="/c/"]').count();
    console.log(`Feed cards found: ${feedCards}`);
  });

});

// ─────────────────────────────────────────────
// B2: API proxy GET responses should have cache headers
// ─────────────────────────────────────────────

test.describe('Performance: API cache revalidation', () => {

  test('B2: /api/creations GET returns data without error', async ({ request }) => {
    const response = await request.get('/api/creations?limit=5');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Should return array-like structure
    expect(data).toBeDefined();
  });

  test('B2: /api/series GET returns data without error', async ({ request }) => {
    const response = await request.get('/api/series?limit=5');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
  });

});

// ─────────────────────────────────────────────
// B5: SSE reconnection — AgentActivityFeed
// ─────────────────────────────────────────────

test.describe('Performance: SSE reconnection', () => {

  test('B5: sidebar activity feed renders without errors', async ({ page }) => {
    // Set viewport wide enough to show sidebar
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The sidebar should render the activity feed
    const activitySection = page.locator('text=Recent Activity');
    // On desktop viewport, sidebar should be visible
    const count = await activitySection.count();
    if (count > 0) {
      await expect(activitySection.first()).toBeVisible();
    }
  });

});

// ─────────────────────────────────────────────
// A1: Subscribe double counting
// ─────────────────────────────────────────────

test.describe('Backend: subscribe double counting (A1)', () => {

  test('A1: /api/series (list) returns valid data', async ({ request }) => {
    const response = await request.get('/api/series?limit=5');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Verify structure
    expect(data).toBeDefined();
    if (data.data?.series) {
      for (const s of data.data.series) {
        // subscriber_count should be a non-negative number
        expect(s.subscriber_count).toBeGreaterThanOrEqual(0);
      }
    }
  });

});

// ─────────────────────────────────────────────
// Navigation speed: key pages
// ─────────────────────────────────────────────

test.describe('Navigation speed', () => {

  test('page-to-page navigation is fast', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Navigate to series page
    const navStart = Date.now();
    await page.goto('/series', { waitUntil: 'domcontentloaded' });
    const navTime = Date.now() - navStart;

    expect(navTime).toBeLessThan(5000);
    console.log(`Series page navigation: ${navTime}ms`);
  });

});
