# Playwright Testing - Quick Start Guide

**Status**: ✅ **PRODUCTION READY**
**Last Validated**: April 13, 2026
**Test Results**: 6/6 tests passing (1.5m runtime)

---

## One-Command Test Run

```bash
npm run test:e2e:demo
```

This single command:
1. Seeds the database with 10 cases + 80 evidence + 40 POIs + 20 reports
2. Runs all Playwright tests in `tests/e2e/demo-seed.spec.ts`
3. Tests auto-login via the demo auth fixture

---

## Manual Setup (for development)

### Step 1: Seed Database

```bash
npm run db:seed:demo
```

**Output:**
```
✅ 4 users
✅ 10 cases (CASE-DEMO-001 to CASE-DEMO-010)
✅ 80 evidence items (8 per case)
✅ 40 POIs (4 per case)
✅ 20 reports (2 per case)
```

### Step 2: Start Dev Server

```bash
npm run dev
```

This enables `DEV_BYPASS_AUTH=true` automatically.

### Step 3: Validate Setup

```bash
node scripts/validate-demo-setup.mjs
```

**Expected Output:**
```
✅ Dev server is running
✅ Demo user exists: demo@legal-ai.local (admin)
✅ Login endpoint works
✅ Seeded data verified
✅ Playwright auth fixture exists
✅ ALL CHECKS PASSED - Ready for Playwright testing!
```

### Step 4: Run Playwright Tests

```bash
# Run demo seed tests
npm run test:e2e:demo

# Run all Playwright tests
npm run test:e2e

# Run with UI mode (interactive)
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/demo-seed.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

---

## Writing New Tests

### Using the Auth Fixture

```typescript
// tests/e2e/my-test.spec.ts
import { test, expect } from '../fixtures/demo-auth';

test('my test', async ({ authenticatedPage: page }) => {
  // Already logged in as demo@legal-ai.local
  await page.goto('http://localhost:5173/dashboard');

  // Your assertions...
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

### Navigating to Seeded Data

Use deterministic case numbers:

```typescript
test('navigate to specific case', async ({ authenticatedPage: page }) => {
  await page.goto('http://localhost:5173/cases');

  // Click on CASE-DEMO-001 (stable identifier)
  await page.locator('text=CASE-DEMO-001').click();

  // Verify case details load
  await expect(page.locator('text=State v. Johnson')).toBeVisible();
});
```

### Testing with Seeded Evidence

```typescript
test('verify evidence count', async ({ authenticatedPage: page }) => {
  await page.goto('http://localhost:5173/evidence-library');

  // Should see 80 evidence items
  const items = page.locator('[data-testid="evidence-item"]');
  const count = await items.count();

  expect(count).toBeGreaterThanOrEqual(80);
});
```

---

## Seeded Test Data

### Users

| Email | Password | Role |
|-------|----------|------|
| demo@legal-ai.local | password123 | admin |
| prosecutor@legal.ai | password123 | prosecutor |
| detective@legal.ai | password123 | detective |
| admin@legal.ai | password123 | admin |

### Cases (10 total)

All cases have deterministic case numbers: `CASE-DEMO-001` through `CASE-DEMO-010`

**Example cases:**
- `CASE-DEMO-001`: State v. Johnson - Fraud Investigation
- `CASE-DEMO-003`: People v. Martinez - Drug Trafficking
- `CASE-DEMO-007`: People v. Ortega - Corporate Espionage
- `CASE-DEMO-010`: State v. Chen - Identity Theft Ring

### Evidence (80 total)

Each case has 8 evidence items:
1. Email correspondence (.pdf)
2. Bank statement (.pdf)
3. Surveillance photo (.jpg)
4. Security camera footage (.mp4)
5. Phone call recording (.mp3)
6. Contract agreement (.pdf)
7. Financial records (.xlsx)
8. Witness statement (.pdf)

### POIs (40 total)

Each case has 4 POIs:
1. Primary Suspect (high threat)
2. Key Witness (low threat)
3. Person of Interest (medium threat)
4. Associate (medium threat)

### Reports (20 total)

Each case has 2 reports:
1. Initial Investigation Summary
2. Forensic Analysis Report

---

## Troubleshooting

### "Demo user not found" error

**Cause**: Database not seeded
**Fix**: Run `npm run db:seed:demo`

### "This endpoint is only available in development mode"

**Cause**: `DEV_BYPASS_AUTH` not set
**Fix**: Use `npm run dev` (sets it automatically)

### "Dev server is NOT running"

**Cause**: SvelteKit dev server not started
**Fix**: Run `npm run dev` in a separate terminal

### Tests fail with navigation errors

**Cause**: Routes may have changed or auth not working
**Fix**:
1. Run validation: `node scripts/validate-demo-setup.mjs`
2. Check dev server logs
3. Verify `DEV_BYPASS_AUTH=true` is set

### Seeded data not visible in UI

**Cause**: Wrong database or port
**Fix**: Verify `.env` has `DATABASE_URL=...@127.0.0.1:5434/legal_ai_db`

---

## CI/CD Integration (Future)

For GitHub Actions or CI/CD:

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: 123456
        ports:
          - 5434:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: cd sveltekit-frontend && npm install

      - name: Seed database
        run: cd sveltekit-frontend && npm run db:seed:demo
        env:
          DATABASE_URL: postgresql://postgres:123456@localhost:5434/legal_ai_db

      - name: Start dev server
        run: cd sveltekit-frontend && npm run dev &
        env:
          DEV_BYPASS_AUTH: true

      - name: Wait for server
        run: npx wait-on http://localhost:5173

      - name: Run Playwright tests
        run: cd sveltekit-frontend && npm run test:e2e:demo

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: sveltekit-frontend/playwright-report/
```

---

## Performance Tips

### Parallel Test Execution

Playwright runs tests in parallel by default. Configure workers:

```typescript
// playwright.config.ts
export default {
  workers: process.env.CI ? 1 : 4, // 4 parallel tests locally
};
```

### Reuse Auth State

The auth fixture automatically reuses the login session across tests in the same worker.

### Selective Test Running

```bash
# Run only tests matching pattern
npx playwright test -g "dashboard"

# Run only tests in specific file
npx playwright test tests/e2e/demo-seed.spec.ts

# Run only failed tests
npx playwright test --last-failed
```

---

## Next Steps

1. ✅ **Basic setup complete** - All systems ready
2. Add more test coverage:
   - Evidence upload flow
   - Case creation
   - POI management
   - Report generation
3. Add screenshot tests:
   - Dashboard views
   - List pages
   - Detail pages
4. Add API tests:
   - REST endpoints
   - SSE streams
   - WebSocket connections

---

## Validation Checklist

Before running tests, verify:

- [x] Dev server running (`npm run dev`)
- [x] Database seeded (`npm run db:seed:demo`)
- [x] Login endpoint works (`curl -X POST http://localhost:5173/api/dev/login-demo`)
- [x] Seeded data visible (10 cases, 80 evidence, 40 POIs, 20 reports)
- [x] Auth fixture exists (`tests/fixtures/demo-auth.ts`)

**Quick validation**: `node scripts/validate-demo-setup.mjs`

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Enhanced Demo Seed Guide](./ENHANCED_DEMO_SEED_COMPLETE.md)
- [SvelteKit Testing Guide](https://kit.svelte.dev/docs/testing)
- [Lucia v3 Docs](https://lucia-auth.com/)
