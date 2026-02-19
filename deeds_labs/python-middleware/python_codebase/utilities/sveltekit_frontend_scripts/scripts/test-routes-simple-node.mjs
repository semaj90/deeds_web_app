#!/usr/bin/env node

import http from 'http';

console.log('🧪 Simple Route Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const routes = [
  '/',
  '/ai',
  '/evidence',
  '/auth',
  '/login'
];

async function testRoute(route) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5173,
      path: route,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      resolve({
        route,
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 400
      });
    });

    req.on('error', (err) => {
      resolve({
        route,
        statusCode: 0,
        success: false,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        route,
        statusCode: 0,
        success: false,
        error: 'Timeout'
      });
    });

    req.end();
  });
}

async function main() {
  console.log(`🚀 Testing ${routes.length} routes...\n`);

  const results = [];

  for (const route of routes) {
    const result = await testRoute(route);
    const status = result.success ? '✅' : '❌';
    const statusText = result.success ? 'PASS' : 'FAIL';
    console.log(`  ${status} ${result.route} (${result.statusCode}) - ${statusText}`);
    results.push(result);
  }

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const successRate = ((passed / results.length) * 100).toFixed(2);

  console.log('\n📊 Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Routes: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${successRate}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Routes:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`  - ${result.route}: ${result.error || 'HTTP ' + result.statusCode}`);
    });
  }

  if (passed > 0) {
    console.log('\n✅ Passed Routes:');
    results.filter(r => r.success).forEach(result => {
      console.log(`  - ${result.route}: HTTP ${result.statusCode}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);