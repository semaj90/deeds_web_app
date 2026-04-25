#!/usr/bin/env node

/**
 * Integration Test Runner
 * Runs comprehensive integration tests for the Legal AI platform
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const FRONTEND_DIR = join(ROOT_DIR, 'sveltekit-frontend');

console.log('🚀 Starting Legal AI Platform Integration Tests\n');

// Check if we're in the right directory
if (!existsSync(join(FRONTEND_DIR, 'package.json'))) {
  console.error('❌ Error: Must be run from the project root directory');
  process.exit(1);
}

const tests = [
  {
    name: 'API Integration Tests',
    command: 'npm run test:integration:api',
    description: 'Test all API endpoints and data flow'
  },
  {
    name: 'POI Manager Integration',
    command: 'npm run test:integration:poi',
    description: 'Test POI creation, editing, and management workflow'
  },
  {
    name: 'ErrorBrain Modal Integration',
    command: 'npm run test:integration:error-brain',
    description: 'Test error analysis modal and route interaction logging'
  },
  {
    name: 'End-to-End Workflow',
    command: 'npm run test:integration:e2e',
    description: 'Complete user journey from POI creation to error analysis'
  }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n📋 Running: ${test.name}`);
  console.log(`   ${test.description}`);

  try {
    execSync(test.command, {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
        REDIS_URL: 'redis://localhost:6379'
      }
    });

    console.log(`✅ ${test.name} PASSED`);
    passed++;
  } catch (error) {
    console.log(`❌ ${test.name} FAILED`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 Integration Test Results:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n❌ Some integration tests failed. Check the output above for details.');
  process.exit(1);
} else {
  console.log('\n🎉 All integration tests passed! The platform is ready for deployment.');
}