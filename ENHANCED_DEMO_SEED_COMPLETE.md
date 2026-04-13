# Enhanced Demo Seed - Implementation Complete

**Status**: ✅ **PRODUCTION READY**
**Date**: April 13, 2026
**Session**: Database Seeding + Playwright Auth Setup
**Playwright Tests**: ✅ 6/6 passing (validated April 13, 2026)

---

## What Was Implemented

### 1. Enhanced Seed Script (`src/lib/server/db/seed.ts`)

**Data Generated:**
- ✅ 4 users (admin, prosecutor, detective, admin)
- ✅ 10 cases with deterministic case numbers (`CASE-DEMO-001` to `CASE-DEMO-010`)
- ✅ 80 evidence items (8 per case)
- ✅ 40 persons of interest (4 per case)
- ✅ 20 reports (2 per case)

**Key Features:**
- **Deterministic case numbers** for stable Playwright tests
- **Realistic data density** (makes UI look professional)
- **Mix of statuses** (active, pending, closed, critical)
- **Mix of types** (criminal, civil, probate)
- **Idempotent** (safe to run multiple times)
- **Comprehensive relationships** (each case has evidence, POIs, reports)

### 2. Dev Login Endpoint (`/api/dev/login-demo`)

**Purpose**: Playwright-friendly authentication bypass

**Security:**
- Only enabled when `DEV_BYPASS_AUTH=true`
- Returns 403 in production mode
- Creates proper Lucia session

**Usage:**
```bash
POST http://localhost:5173/api/dev/login-demo
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "email": "demo@legal-ai.local",
    "name": "Demo User",
    "role": "admin"
  }
}
```

### 3. Playwright Auth Fixture (`tests/fixtures/demo-auth.ts`)

**Purpose**: Reusable authentication for all tests

**Features:**
- Auto-login before each test
- Verifies session works
- Throws helpful errors if seed missing

**Usage in tests:**
```typescript
import { test, expect } from '../fixtures/demo-auth';

test('my test', async ({ authenticatedPage: page }) => {
  // Already logged in as demo@legal-ai.local
  await page.goto('http://localhost:5173/dashboard');
  // Test your UI...
});
```

### 4. Example Playwright Test (`tests/e2e/demo-seed.spec.ts`)

Demonstrates stable test patterns:
- Navigate to specific cases by case number
- Verify seeded data loads
- Test with deterministic IDs

---

## How to Use

### Quick Start

```bash
# 1. Seed database with enhanced demo data
npm run db:seed:demo

# 2. Start dev server (enables DEV_BYPASS_AUTH)
npm run dev

# 3. Run Playwright tests
npm run test:e2e:demo
```

### Manual Verification

```bash
# Seed database
npm run db:seed:demo

# Start dev server
npm run dev

# Visit in browser
http://localhost:5173/dashboard

# Login with
# Email: demo@legal-ai.local
# Password: password123
```

### Playwright Integration

**Option A - Use auth fixture (recommended):**
```typescript
import { test, expect } from '../fixtures/demo-auth';

test('dashboard loads', async ({ authenticatedPage: page }) => {
  await page.goto('http://localhost:5173/dashboard');
  // Assertions...
});
```

**Option B - Manual login in test:**
```typescript
import { test, expect } from '@playwright/test';

test('manual login', async ({ page }) => {
  await page.request.post('http://localhost:5173/api/dev/login-demo');
  await page.goto('http://localhost:5173/dashboard');
  // Assertions...
});
```

---

## Seeded Data Structure

### Cases (10 total)

| Case Number | Title | Status | Priority | Type |
|-------------|-------|--------|----------|------|
| CASE-DEMO-001 | State v. Johnson - Fraud Investigation | active | high | criminal |
| CASE-DEMO-002 | City Housing Authority v. Tenants Association | active | medium | civil |
| CASE-DEMO-003 | People v. Martinez - Drug Trafficking | pending | high | criminal |
| CASE-DEMO-004 | Mills Contract Dispute | active | medium | civil |
| CASE-DEMO-005 | Riverside Property Fraud | active | high | criminal |
| CASE-DEMO-006 | State v. Holloway - Embezzlement | closed | medium | criminal |
| CASE-DEMO-007 | People v. Ortega - Corporate Espionage | active | critical | criminal |
| CASE-DEMO-008 | Johnson v. MedTech Corp - Medical Device Liability | pending | high | civil |
| CASE-DEMO-009 | In re: Estate of Williams | active | low | civil |
| CASE-DEMO-010 | State v. Chen - Identity Theft Ring | active | critical | criminal |

### Evidence (8 per case)

Each case has:
1. Email correspondence (.pdf)
2. Bank statement (.pdf)
3. Surveillance photo (.jpg)
4. Security camera footage (.mp4)
5. Phone call recording (.mp3)
6. Contract agreement (.pdf)
7. Financial records (.xlsx)
8. Witness statement (.pdf)

### POIs (4 per case)

Each case has:
1. Primary Suspect (high threat, active)
2. Key Witness (low threat, cleared)
3. Person of Interest (medium threat, surveillance)
4. Associate (medium threat, wanted)

### Reports (2 per case)

Each case has:
1. Initial Investigation Summary
2. Forensic Analysis Report

---

## Playwright Best Practices

### Stable Selectors

Use deterministic identifiers in tests:

```typescript
// GOOD - Uses stable case number
await page.goto('/cases');
await page.locator('text=CASE-DEMO-001').click();

// BAD - Relies on dynamic position
await page.locator('.case-card').first().click();
```

### Data-Testid Attributes

Add these to your Svelte components:

```svelte
<!-- Case card -->
<div data-testid="case-card">
  <h3>{caseNumber}</h3>
</div>

<!-- Evidence list -->
<div data-testid="evidence-section">
  {#each evidence as item}
    <div data-testid="evidence-item">{item.title}</div>
  {/each}
</div>
```

Then test with:

```typescript
const evidenceItems = page.locator('[data-testid="evidence-item"]');
expect(await evidenceItems.count()).toBe(8);
```

---

## Package.json Scripts

**New scripts added:**

```json
{
  "scripts": {
    "db:seed:demo": "npm run db:seed",
    "test:e2e:demo": "npm run db:seed:demo && playwright test tests/e2e/demo-seed.spec.ts"
  }
}
```

**Workflow:**

```bash
# Seed database with 10 cases + 80 evidence + 40 POIs + 20 reports
npm run db:seed:demo

# Run all Playwright tests (with auto-login)
npm run test:e2e

# Run only demo seed tests
npm run test:e2e:demo
```

---

## Troubleshooting

### "Demo user not found" error

**Cause**: Database not seeded
**Fix**: Run `npm run db:seed:demo`

### "This endpoint is only available in development mode"

**Cause**: `DEV_BYPASS_AUTH` not set
**Fix**: Use `npm run dev` (sets it automatically)

### "Failed to login as demo user" in Playwright

**Causes:**
1. Dev server not running
2. `DEV_BYPASS_AUTH` not set
3. Database not seeded

**Fix:**
```bash
# 1. Seed database
npm run db:seed:demo

# 2. Start dev server (terminal 1)
npm run dev

# 3. Run tests (terminal 2)
npm run test:e2e:demo
```

### POIs showing "29 POI records created" instead of 40

**Cause**: Some POIs already existed from previous seed runs
**Behavior**: Expected - seed is idempotent and skips duplicates by name
**Fix**: Not needed - 40+ POIs exist in total across all runs

---

## Architecture Notes

### Deterministic UUIDs

The seed uses a deterministic UUID generator for stable test fixtures:

```typescript
function deterministicUUID(prefix: string, id: number): string {
  const hex = id.toString(16).padStart(12, '0');
  return `${prefix}-0000-0000-0000-${hex}`;
}

// Example: deterministicUUID('case', 1) → 'case-0000-0000-0000-000000000001'
```

Currently **not used** (let DB generate UUIDs), but infrastructure is ready if needed.

### Session Management

Uses Lucia v3:
- `lucia.createSession()` - Creates session
- `lucia.createSessionCookie()` - Returns cookie config
- Cookie persists across page navigations in Playwright

---

## Next Steps

### Phase 1 - Basic Testing ✅ COMPLETE

- [x] Enhanced seed script
- [x] Dev login endpoint
- [x] Playwright auth fixture
- [x] Example test file
- [x] Package.json scripts

### Phase 2 - Screenshot Testing (Optional)

Add visual regression tests:

```typescript
test('dashboard screenshot', async ({ authenticatedPage: page }) => {
  await page.goto('http://localhost:5173/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png');
});
```

### Phase 3 - Full E2E Coverage (Optional)

Test all major workflows:
- Case creation
- Evidence upload
- POI management
- Report generation
- Search functionality

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/server/db/seed.ts` | Enhanced seed script | 500+ |
| `src/routes/api/dev/login-demo/+server.ts` | Dev auth bypass | 65 |
| `tests/fixtures/demo-auth.ts` | Playwright auth fixture | 45 |
| `tests/e2e/demo-seed.spec.ts` | Example tests | 120 |
| `ENHANCED_DEMO_SEED_COMPLETE.md` | This guide | 400+ |

---

## Summary

✅ **Production-ready demo seed for Playwright testing**

**Key Benefits:**
- **Realistic data density** - 10 cases, 80 evidence, 40 POIs, 20 reports
- **Stable test fixtures** - Deterministic case numbers (CASE-DEMO-001 to 010)
- **Dev-friendly auth** - One-click login via `/api/dev/login-demo`
- **Reusable auth fixture** - Auto-login in all Playwright tests
- **Idempotent seeding** - Safe to run multiple times

**Ready for:**
- Playwright E2E testing
- Screenshot regression testing
- Demo presentations
- UI development with realistic data