# Integration Tests for Legal AI Platform

This directory contains comprehensive integration tests for the Legal AI platform, covering POI management, error analysis, API endpoints, and end-to-end workflows.

## Diagnostics Regression Checkpoint

Run this focused checkpoint after diagnostics-related changes:

```bash
npm run test:diagnostics
```

Variants:

```bash
npm run test:diagnostics:unit
npm run test:diagnostics:e2e
```

Matching VS Code tasks:
- `Diagnostics Regression Slice`
- `Diagnostics Regression Slice (Unit)`
- `Diagnostics Regression Slice (E2E)`

Coverage includes evidence diagnostics rendering, `/api/evidence/[id]` metadata normalization and `404` handling, `/api/rag/search` diagnostics payloads, and the focused evidence upload Playwright flow.

## Test Structure

### Test Files

- **`poi-manager-integration.spec.ts`** - POI Manager UI integration tests
- **`error-brain-integration.spec.ts`** - ErrorBrainModal integration tests
- **`api-integration.spec.ts`** - API endpoint integration tests
- **`e2e-workflow.spec.ts`** - End-to-end user workflow tests

### Configuration

- **`playwright.integration.config.ts`** - Playwright configuration for integration tests

## Prerequisites

Before running integration tests, ensure:

1. **Docker services are running:**
   ```bash
   docker-compose up -d
   ```

2. **Database is set up:**
   ```bash
   npm run db:migrate
   ```

3. **Development server is running:**
   ```bash
   npm run dev
   ```

## Running Tests

### Run All Integration Tests
```bash
npm run test:integration:run-all
```

### Run Specific Test Suites

```bash
# POI Manager tests
npm run test:integration:poi

# ErrorBrain Modal tests
npm run test:integration:error-brain

# API endpoint tests
npm run test:integration:api

# End-to-end workflow tests
npm run test:integration:e2e
```

### Debug Mode
```bash
npm run test:integration:debug
```

### Headed Mode (visible browser)
```bash
npm run test:integration:headed
```

## Test Coverage

### POI Manager Integration Tests
- ✅ Page loading and basic UI elements
- ✅ Create POI dialog functionality
- ✅ Form validation with Field components
- ✅ POI creation with comprehensive data
- ✅ POI editing workflow
- ✅ Search functionality
- ✅ View switching (grid/list)

### ErrorBrain Modal Integration Tests
- ✅ Modal opening from route analysis buttons
- ✅ API integration for analysis history
- ✅ Modal closing functionality
- ✅ Route navigation from all-routes page
- ✅ Interaction logging to API
- ✅ Health indicator display
- ✅ Error state handling

### API Integration Tests
- ✅ POI CRUD operations (Create, Read, Update, Delete)
- ✅ Routes API endpoints
- ✅ Error analysis API
- ✅ Health check endpoints
- ✅ File upload API

### End-to-End Workflow Tests
- ✅ Complete POI management workflow
- ✅ Error handling and recovery
- ✅ Data persistence across reloads
- ✅ Concurrent user actions
- ✅ Accessibility compliance
- ✅ Keyboard navigation

## Test Data

Tests use realistic test data that includes:
- Complete POI profiles with physical descriptions
- Profile data with modus operandi and associates
- Various threat levels and priorities
- Error scenarios and edge cases

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run Integration Tests
  run: |
    docker-compose up -d
    npm run db:migrate
    npm run test:integration:run-all
```

## Troubleshooting

### Common Issues

1. **Tests timeout**: Ensure Docker services are running and healthy
2. **Database connection errors**: Check DATABASE_URL environment variable
3. **API endpoint failures**: Verify backend services are running
4. **Browser launch failures**: Install Playwright browsers with `npx playwright install`

### Debug Tips

1. Run tests in headed mode to see what's happening:
   ```bash
   npm run test:integration:headed
   ```

2. Use debug mode for step-by-step execution:
   ```bash
   npm run test:integration:debug
   ```

3. Check service health:
   ```bash
   npm run health:check:all
   ```

## Performance Benchmarks

Integration tests include performance validation:
- Page load times under 3 seconds
- API response times under 1 second
- Form submission times under 2 seconds
- Concurrent user handling (up to 10 simultaneous users)

## Accessibility Testing

Tests include accessibility compliance checks:
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- Form validation feedback

## Contributing

When adding new integration tests:

1. Follow the existing naming convention: `*.integration.spec.ts`
2. Include proper error handling and assertions
3. Add test data that doesn't conflict with production data
4. Update this README with new test coverage
5. Ensure tests can run in parallel when possible

## Test Results

Test results are saved to:
- `test-results/` - JUnit XML reports
- `playwright-report/` - HTML reports with screenshots
- Console output with detailed pass/fail status

View HTML reports:
```bash
npx playwright show-report
```