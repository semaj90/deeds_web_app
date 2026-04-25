# Complete Test Setup Documentation

## Overview

This is a complete, copy-pasteable test setup that provides:
- Local PostgreSQL (with pgvector) in Docker
- Test database creation, schema setup, and seeding
- Playwright global setup with automated test data
- Comprehensive test configuration
- One-command test execution

## Files Created

### Docker Setup
- `docker-compose.test.yml` - PostgreSQL + Redis test containers
- `test_db_setup.sql` - Complete schema with pgvector support
- `seed-test-db.mjs` - Test data seeder with realistic data

### Playwright Configuration
- `sveltekit-frontend/test/global-setup.mjs` - Automated setup
- `sveltekit-frontend/test/global-teardown.mjs` - Cleanup
- `sveltekit-frontend/tests/test-setup.spec.ts` - Setup verification
- `sveltekit-frontend/playwright.config.ts` - Updated configuration

### Test Scripts (added to package.json)
```json
{
  "test:e2e:setup": "docker-compose -f ../docker-compose.test.yml up -d && node ../seed-test-db.mjs",
  "test:e2e:teardown": "docker-compose -f ../docker-compose.test.yml down -v",
  "test:e2e:full": "npm run test:e2e:setup && npm run test:e2e && npm run test:e2e:teardown"
}
```

## Usage

### Quick Start - Run All Tests
```bash
cd sveltekit-frontend
npm run test:e2e:full
```

### Manual Control
```bash
# Start test environment
npm run test:e2e:setup

# Run tests
npm run test:e2e

# Cleanup
npm run test:e2e:teardown
```

### Individual Test Execution
```bash
# Run specific test file
npx playwright test auth-api.spec.ts

# Run with UI mode
npx playwright test --ui

# Run with debugging
npx playwright test --debug
```

## Test Environment Details

### Databases and Services
- **PostgreSQL Test Database**: localhost:5434
  - Database: `legal_ai_test`
  - User: `legal_admin`
  - Password: `testpass123`
  - Extensions: pgvector, uuid-ossp

- **Redis Test Cache**: localhost:6380

### Test User Credentials
- **Email**: `test@example.com`
- **Session ID**: `test_session_123`
- **User ID**: `1ebbbeb1-baed-4c9f-a7d5-7367cf167c57`

### Test Data Includes
- 1 test user with valid session
- 1 test case with full metadata
- 3 test persons of interest (high, medium, low threat levels)
- 1 test evidence file
- 1 test legal document
- 1 test case activity

## Architecture

### Global Setup Process
1. Start Docker containers (PostgreSQL + Redis)
2. Wait for database readiness
3. Create schema and extensions
4. Seed test data
5. Verify environment

### Test Execution
1. Each test browser runs against test database
2. Authentication via session cookies
3. API endpoints tested with real data
4. Frontend pages tested with seeded content

### Global Teardown
1. Stop containers
2. Remove volumes
3. Clean up test artifacts

## Available Test Commands

### Setup Commands
```bash
npm run test:e2e:setup      # Start test environment
npm run test:e2e:teardown   # Stop and cleanup
```

### Test Execution
```bash
npm run test:e2e           # Run all e2e tests
npm run test:e2e:ui        # Run with Playwright UI
npm run test:e2e:headed    # Run with browser visible
npm run test:e2e:full      # Setup + Test + Teardown
```

### Debug Commands
```bash
npx playwright test --debug                    # Debug mode
npx playwright test --trace on                # With tracing
npx playwright test auth-api.spec.ts --headed # Specific test, visible
```

## Test Configuration Features

### Environment Variables
- `DATABASE_URL`: Points to test database during tests
- `REDIS_URL`: Points to test Redis instance
- Isolated from development environment

### Playwright Config
- Global setup/teardown
- Browser projects with dependencies
- Proper timeout handling (3 minutes for GPU tests)
- Screenshot and video on failure
- Trace recording on retry

### Database Schema
- Full legal AI platform schema
- pgvector support for embeddings
- JSONB fields for flexible metadata
- Proper indexes for performance
- UUID primary keys throughout

## Troubleshooting

### Database Connection Issues
```bash
# Check if containers are running
docker ps

# Check database logs
docker-compose -f docker-compose.test.yml logs postgres-test

# Test database connection
PGPASSWORD=testpass123 psql -h localhost -p 5434 -U legal_admin -d legal_ai_test -c "SELECT 1;"
```

### Test Data Issues
```bash
# Reseed test data
node seed-test-db.mjs

# Check test data
PGPASSWORD=testpass123 psql -h localhost -p 5434 -U legal_admin -d legal_ai_test -c "SELECT COUNT(*) FROM persons_of_interest;"
```

### Playwright Issues
```bash
# Install browsers
npx playwright install

# Check Playwright config
npx playwright test --list

# Run setup verification
npx playwright test test-setup.spec.ts
```

## File Structure
```
deeds-web-app/
├── docker-compose.test.yml         # Test containers
├── test_db_setup.sql              # Database schema
├── seed-test-db.mjs               # Test data seeder
├── TEST_SETUP.md                  # This documentation
└── sveltekit-frontend/
    ├── playwright.config.ts       # Updated config
    ├── test/
    │   ├── global-setup.mjs       # Playwright global setup
    │   └── global-teardown.mjs    # Playwright global teardown
    └── tests/
        ├── test-setup.spec.ts     # Setup verification
        └── auth-api.spec.ts       # Existing auth tests
```

## Production Notes

This test setup is designed for:
- ✅ Isolated test environment
- ✅ Reliable CI/CD integration
- ✅ Fast test execution
- ✅ Easy debugging
- ✅ Complete cleanup
- ✅ Real database interactions
- ✅ Authentic user sessions

The setup ensures tests run against a clean, known state every time while remaining completely isolated from development and production data.