# Cache System Testing Guide

## Overview

Comprehensive test suite for the two-layer cache system (LokiJS + IndexedDB) with Svelte 5 runes integration.

## Test Coverage

### Unit Tests (24 tests - 100% passing ✅)
Location: `src/lib/cache/__tests__/cache.test.ts`

**IndexedDB Cache Service (7 tests)**
- ✅ Initialization with default configuration
- ✅ Get/set operations with cached entries
- ✅ TTL expiration handling
- ✅ Delete operations
- ✅ Clear all cache
- ✅ Statistics tracking (hits, misses, total operations)

**LokiJS Cache Service (9 tests)**
- ✅ Collection creation and retrieval
- ✅ Document insertion
- ✅ Find by ID operations
- ✅ TTL expiration for documents
- ✅ Query with filters
- ✅ Delete by ID
- ✅ Clear all documents
- ✅ Export/import snapshots
- ✅ Statistics tracking

**Unified Cache Service (5 tests)**
- ✅ Two-layer strategy (memory first, then persistent)
- ✅ Write to both layers
- ✅ Delete from both layers
- ✅ Health check status
- ✅ Hit rate calculation

**Offline Fetch Helper (3 tests)**
- ✅ Fetch from API when online
- ✅ Use cache when offline
- ✅ Queue mutations when offline

### E2E Tests (15 tests)
Location: `tests/cache-system.spec.ts`

**Two-Layer Architecture (7 tests)**
- Cache health status display
- Memory-only cache operations
- Persistent-only cache operations
- Two-layer cache operations
- Clear all caches
- LokiJS snapshot persistence/restore
- Accurate cache statistics

**Case Detail Integration (2 tests)**
- Cache case detail data with TTL
- Invalidate cache on evidence upload

**Form Auto-Save (3 tests)**
- Auto-save form data with debouncing
- Clear draft after form submission
- Toggle auto-save on/off

**Offline Mode (2 tests)**
- Show offline indicator when offline
- Use cached data when offline

**Performance (1 test)**
- Demonstrate cache performance improvement

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npm run test:unit:watch

# Run with coverage
npm run test:unit:coverage

# Run cache tests only
npm run test:cache
```

### E2E Tests
```bash
# Run all E2E tests (auto-starts dev server)
npm run test:e2e

# Run cache E2E tests only
npm run test:e2e:cache

# Run with visible browser
npm run test:e2e:cache:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Test Configuration

### Vitest (Unit Tests)
- **Environment**: jsdom (browser-like)
- **Test Pattern**: `src/**/*.{test,spec}.{js,ts}`
- **Setup File**: `src/test-setup.ts`
- **Timeout**: 15000ms
- **Globals**: Enabled

### Playwright (E2E Tests)
- **Base URL**: `http://127.0.0.1:5175`
- **Browser**: Chromium
- **Workers**: 1 (sequential tests)
- **Timeout**: 60000ms (1 minute)
- **Auto Web Server**: Yes (runs `npm run dev` automatically)
- **Screenshots**: On failure only
- **Traces**: On first retry

## Test Architecture

### Mocking Strategy

**Unit Tests**:
```typescript
// Mock idb-keyval (IndexedDB wrapper)
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  keys: vi.fn()
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: true
}));

// Mock navigator.onLine for offline tests
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: false
});
```

**E2E Tests**:
```typescript
// Monitor console logs for cache behavior
page.on('console', (msg) => {
  if (msg.type() === 'log') consoleLogs.push(msg.text());
});

// Simulate offline mode
await context.setOffline(true);
```

### Test Patterns

**Unit Test Pattern**:
```typescript
describe('Service Name', () => {
  let service: ServiceType;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceType();
  });

  it('should perform specific behavior', async () => {
    // Arrange
    vi.mocked(dependency).mockResolvedValue(testData);

    // Act
    const result = await service.method();

    // Assert
    expect(result).toEqual(expectedValue);
    expect(dependency).toHaveBeenCalledWith(expectedArgs);
  });
});
```

**E2E Test Pattern**:
```typescript
test('should perform user action', async ({ page }) => {
  // Navigate
  await page.goto('/cache-demo');
  await page.waitForLoadState('networkidle');

  // Interact
  await page.fill('input[placeholder="key"]', 'test-key');
  await page.click('button:has-text("Set")');

  // Assert
  await expect(page.locator('.result')).toContainText('cached');
});
```

## Test Results

### Unit Tests
```
✓ src/lib/cache/__tests__/cache.test.ts (24 tests) 958ms
  ✓ IndexedDB Cache Service (7)
  ✓ LokiJS Cache Service (9)
  ✓ Unified Cache Service (5)
  ✓ Offline Fetch Helper (3)

Test Files  1 passed (1)
Tests       24 passed (24)
Duration    3.15s
```

### Coverage Goals
- **Target**: >80% coverage for cache services
- **Priority Files**:
  - `indexdb-cache.svelte.ts`
  - `loki-cache.svelte.ts`
  - `cache-service.svelte.ts`
  - `offline-fetch.ts`

## Debugging Tests

### Unit Test Debugging
```bash
# Run in watch mode for TDD
npm run test:unit:watch

# Run specific test file
npx vitest run src/lib/cache/__tests__/cache.test.ts

# Run with verbose output
npx vitest run --reporter=verbose
```

### E2E Test Debugging
```bash
# Run with visible browser
npm run test:e2e:cache:headed

# Debug mode (opens Playwright Inspector)
npx playwright test tests/cache-system.spec.ts --debug

# View trace for failed tests
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Common Issues

**Unit Tests**:
- **Mock not working**: Clear mocks in `beforeEach`
- **Timing issues**: Use `await` for async operations
- **Browser API errors**: Check jsdom environment setup

**E2E Tests**:
- **Element not found**: Check selector accuracy, use `waitForSelector`
- **Timeout errors**: Increase timeout or wait for specific events
- **Flaky tests**: Add `waitForLoadState('networkidle')` after navigation

## Adding New Tests

### Unit Test Example
```typescript
it('should handle edge case', async () => {
  // Arrange
  const edgeCaseData = { /* ... */ };
  vi.mocked(get).mockResolvedValue(edgeCaseData);

  // Act
  const result = await cache.get('edge-case-key');

  // Assert
  expect(result).toEqual(edgeCaseData);
});
```

### E2E Test Example
```typescript
test('should handle new user interaction', async ({ page }) => {
  await page.goto('/cache-demo');

  // Perform new interaction
  await page.click('button#new-feature');

  // Verify behavior
  await expect(page.locator('.result')).toBeVisible();
});
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit:coverage

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

1. **Keep tests isolated**: Each test should be independent
2. **Use descriptive names**: Test names should explain what they verify
3. **Test behavior, not implementation**: Focus on observable outcomes
4. **Mock external dependencies**: Don't rely on external services
5. **Use beforeEach for setup**: Keep tests DRY
6. **Clean up after tests**: Reset mocks, clear cache
7. **Test edge cases**: Empty values, errors, timeouts
8. **Keep tests fast**: Use mocks, avoid unnecessary waits

## Continuous Improvement

- [ ] Add visual regression tests for cache demo UI
- [ ] Add performance benchmarks
- [ ] Add mutation testing with Stryker
- [ ] Improve test coverage to 90%+
- [ ] Add snapshot tests for complex data structures
- [ ] Add accessibility tests with axe-playwright

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/docs/svelte-testing-library/intro/)
- [Svelte Testing Best Practices](https://svelte.dev/docs/testing)
