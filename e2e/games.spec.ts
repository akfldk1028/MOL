import { test, expect } from '@playwright/test';

test.describe('Hex Wars', () => {
  test('games page loads', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('h1')).toContainText('Hex Wars');
  });

  test('games list shows empty state', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('text=No games yet')).toBeVisible();
  });

  test('games API returns empty list', async ({ request }) => {
    const response = await request.get('/api/games');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
