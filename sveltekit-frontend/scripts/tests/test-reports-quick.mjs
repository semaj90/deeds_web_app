#!/usr/bin/env node

/**
 * Quick Report Routes Smoke Test
 * Fast sanity check for report functionality
 *
 * Usage:
 *   node scripts/tests/test-reports-quick.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

async function test(name, url) {
  try {
    const response = await fetch(url);
    const status = response.status;
    const pass = status >= 200 && status < 300;
    console.log(`${pass ? '✅' : '❌'} (${status}) ${name}`);
    return pass;
  } catch (error) {
    console.log(`❌ (ERR) ${name} - ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('\n⚡ Quick Report Routes Test\n');

  const results = await Promise.all([
    test('API /api/reports', `${BASE_URL}/api/reports`),
    test('UI  /reports', `${BASE_URL}/reports`),
    test('UI  /reports/new', `${BASE_URL}/reports/new?caseId=test-id`)
  ]);

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n${passed}/${total} tests passed`);
  process.exit(passed === total ? 0 : 1);
}

run();
