---
title: Playwright Testing Patterns
description: Guide to end-to-end testing with Playwright in SvelteKit.
tags: [testing, playwright, e2e, qa, automation]
type: pattern
---

# Playwright Testing Patterns

## 1. Basic Test Structure

Tests are located in `tests/`.

```typescript
import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});
```

## 2. Locators

Prefer user-facing locators.

```typescript
// Good
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('user@example.com');
await page.getByText('Welcome').isVisible();

// Avoid
await page.locator('.submit-btn').click(); // Brittle class selector
```

## 3. Authentication Testing

Use `storageState` or helper functions to bypass login UI for authenticated routes.

```typescript
test.describe('Authenticated routes', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('dashboard is accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
  });
});
```

## 4. API Testing

Playwright can test API endpoints directly.

```typescript
test('API returns data', async ({ request }) => {
  const response = await request.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.length).toBeGreaterThan(0);
});
```

## 5. Visual Regression

```typescript
test('snapshot test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot();
});
```

## 6. Best Practices

*   **Isolation**: Each test should be independent.
*   **Waiting**: Playwright auto-waits, avoid manual `page.waitForTimeout()`.
*   **Fixtures**: Use fixtures for reusable setup code.
*   **Parallelism**: Run tests in parallel for speed.
