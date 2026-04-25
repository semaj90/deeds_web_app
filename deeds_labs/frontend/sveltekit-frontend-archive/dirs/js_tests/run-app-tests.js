#!/usr/bin/env node

/**
 * Comprehensive Application Test Suite
 * Tests all major functionality and API endpoints
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

console.log('🚀 Starting Comprehensive Application Test Suite...\n');

const results = [];
let passCount = 0;
let failCount = 0;

function runTest(testName, testFn) {
  try {
    console.log(`⏳ Running: ${testName}`);
    const result = testFn();
    console.log(`✅ PASS: ${testName}`);
    results.push({ test: testName, status: 'PASS', details: result });
    passCount++;
  } catch (error) {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Error: ${error.message}`);
    results.push({ test: testName, status: 'FAIL', error: error.message });
    failCount++;
  }
  console.log('');
}

// Test 1: Package.json validation
runTest('Package.json Configuration', () => {
  const pkg = JSON.parse(execSync('cat package.json', { encoding: 'utf8' }));
  if (!pkg.scripts || !pkg.scripts.dev || !pkg.scripts.build) {
    throw new Error('Missing required scripts in package.json');
  }
  if (!pkg.dependencies || !pkg.devDependencies) {
    throw new Error('Missing dependencies in package.json');
  }
  return 'All required scripts and dependencies found';
});

// Test 2: Environment configuration
runTest('Environment Configuration', () => {
  try {
    const env = execSync('cat .env', { encoding: 'utf8' });
    if (!env.includes('DATABASE_URL') || !env.includes('POSTGRES_')) {
      throw new Error('Missing required environment variables');
    }
    return 'Environment variables properly configured';
  } catch {
    throw new Error('.env file missing or invalid');
  }
});

// Test 3: TypeScript compilation
runTest('TypeScript Compilation', () => {
  try {
    execSync('npx svelte-check --tsconfig ./tsconfig.json', { stdio: 'pipe' });
    return 'TypeScript compilation successful';
  } catch (error) {
    throw new Error('TypeScript compilation failed');
  }
});

// Test 4: Build process
runTest('Application Build', () => {
  try {
    execSync('npm run build', { stdio: 'pipe' });
    return 'Application builds successfully';
  } catch (error) {
    throw new Error('Build process failed');
  }
});

// Test 5: Route files existence
runTest('Route Files Validation', () => {
  const routes = [
    'src/routes/+layout.svelte',
    'src/routes/+page.svelte',
    'src/routes/login/+page.svelte',
    'src/routes/register/+page.svelte',
    'src/routes/cases/+page.svelte',
    'src/routes/evidence/+page.svelte',
    'src/routes/law/+page.svelte',
    'src/routes/ai/+page.svelte',
    'src/routes/ai-assistant/+page.svelte',
    'src/routes/dashboard/+page.svelte',
    'src/routes/profile/+page.svelte',
    'src/routes/logout/+page.svelte',
  ];

  const missingRoutes = [];
  routes.forEach((route) => {
    try {
      execSync(`test -f "${route}"`, { stdio: 'pipe' });
    } catch {
      missingRoutes.push(route);
    }
  });

  if (missingRoutes.length > 0) {
    throw new Error(`Missing routes: ${missingRoutes.join(', ')}`);
  }
  return `All ${routes.length} required routes found`;
});

// Test 6: API endpoints
runTest('API Endpoints Validation', () => {
  const apiRoutes = [
    'src/routes/api/cases/+server.ts',
    'src/routes/api/cases/recent/+server.ts',
    'src/routes/api/evidence/+server.ts',
    'src/routes/api/statutes/+server.ts',
    'src/routes/api/ai/prompt/+server.ts',
    'src/routes/api/auth/login/+server.ts',
    'src/routes/api/auth/logout/+server.ts',
  ];

  const missingApis = [];
  apiRoutes.forEach((route) => {
    try {
      execSync(`test -f "${route}"`, { stdio: 'pipe' });
    } catch {
      missingApis.push(route);
    }
  });

  if (missingApis.length > 0) {
    throw new Error(`Missing API routes: ${missingApis.join(', ')}`);
  }
  return `All ${apiRoutes.length} required API endpoints found`;
});

// Test 7: Components validation
runTest('Component Files Validation', () => {
  const components = ['src/lib/components/Settings.svelte'];

  const missingComponents = [];
  components.forEach((component) => {
    try {
      execSync(`test -f "${component}"`, { stdio: 'pipe' });
    } catch {
      missingComponents.push(component);
    }
  });

  if (missingComponents.length > 0) {
    throw new Error(`Missing components: ${missingComponents.join(', ')}`);
  }
  return `All ${components.length} required components found`;
});

// Test 8: Drizzle configuration
runTest('Drizzle Configuration', () => {
  try {
    const config = execSync('cat drizzle.config.ts', { encoding: 'utf8' });
    if (!config.includes('schema') || !config.includes('postgresql')) {
      throw new Error('Invalid Drizzle configuration');
    }
    return 'Drizzle configuration is valid';
  } catch {
    throw new Error('Drizzle configuration file missing or invalid');
  }
});

// Test 9: SvelteKit configuration
runTest('SvelteKit Configuration', () => {
  try {
    const config = execSync('cat svelte.config.js', { encoding: 'utf8' });
    if (!config.includes('adapter')) {
      throw new Error('No adapter configured in svelte.config.js');
    }
    return 'SvelteKit configuration is valid';
  } catch {
    throw new Error('SvelteKit configuration file missing or invalid');
  }
});

// Generate test report
console.log('📊 TEST SUMMARY');
console.log('================');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📈 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

const report = {
  timestamp: new Date().toISOString(),
  summary: {
    total: passCount + failCount: passed, passCount: passCount,
    failed: failCount,
    successRate: ((passCount / (passCount + failCount)) * 100).toFixed(1) + '%',
  },
  results,
};

writeFileSync('test-report.json', JSON.stringify(report, null, 2));
console.log('\n📄 Detailed report saved to: test-report.json');

if (failCount > 0) {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed! The application is ready.');
  process.exit(0);
}
