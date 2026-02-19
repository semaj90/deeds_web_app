#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('🧪 Legal AI Route Testing Suite (PowerShell)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const coreRoutes = [
  '/',
  '/auth',
  '/auth/login',
  '/auth/register',
  '/login',
  '/logout',
  '/register',
  '/profile',
  '/settings',
  '/help'
];

const aiRoutes = [
  '/ai',
  '/ai/assistant',
  '/ai/chat',
  '/ai/dashboard',
  '/ai/rag',
  '/ai/vector-search',
  '/ai/recommendations',
  '/ai/case-scoring',
  '/ai/document-drafting',
  '/ai/pattern-detection',
  '/ai/orchestrator',
  '/ai/processing',
  '/ai/gpu-chat',
  '/ai/summarize',
  '/ai/summary'
];

const evidenceRoutes = [
  '/evidence',
  '/evidence/upload',
  '/evidence/analyze',
  '/evidence/manage',
  '/evidence/realtime',
  '/evidence/hash',
  '/evidence-canvas',
  '/evidence-workspace',
  '/evidence-editor',
  '/evidence-analysis',
  '/evidenceboard',
  '/gaming-evidence-board'
];

const results = {
  passed: [],
  failed: [],
  total: 0,
  startTime: new Date()
};

async function testRoute(route) {
  return new Promise((resolve) => {
    const url = `http://localhost:5173${route}`;

    const powershellScript = `
      try {
        $response = Invoke-WebRequest -Uri '${url}' -Method GET -TimeoutSec 5 -UseBasicParsing
        Write-Host $response.StatusCode
      } catch {
        if ($_.Exception.Response.StatusCode) {
          Write-Host $_.Exception.Response.StatusCode.value__
        } else {
          Write-Host 0
        }
      }
    `;

    const ps = spawn('powershell', ['-Command', powershellScript], {
      stdio: 'pipe',
      shell: false
    });

    let output = '';
    let error = '';

    ps.stdout.on('data', (data) => {
      output += data.toString().trim();
    });

    ps.stderr.on('data', (data) => {
      error += data.toString();
    });

    ps.on('close', (code) => {
      const statusCode = parseInt(output) || 0;
      resolve({
        route,
        statusCode,
        success: statusCode >= 200 && statusCode < 400,
        error: error || null
      });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ps.kill();
      resolve({
        route,
        statusCode: 0,
        success: false,
        error: 'Timeout'
      });
    }, 10000);
  });
}

async function testRoutes(routes, categoryName) {
  console.log(`🚀 Testing ${routes.length} ${categoryName} routes...\n`);

  const batchSize = 5;
  const batches = [];
  for (let i = 0; i < routes.length; i += batchSize) {
    batches.push(routes.slice(i, i + batchSize));
  }

  let batchNumber = 1;
  for (const batch of batches) {
    console.log(`📦 Batch ${batchNumber}/${batches.length} (${batch.length} routes):`);

    const batchPromises = batch.map(route => testRoute(route));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      const status = result.success ? '✅' : '❌';
      const statusText = result.success ? 'PASS' : 'FAIL';
      console.log(`  ${status} ${result.route} (${result.statusCode}) - ${statusText}`);

      if (result.success) {
        results.passed.push(result);
      } else {
        results.failed.push(result);
      }
      results.total++;
    }

    batchNumber++;
    console.log('');
  }
}

function getRoutesToTest() {
  const category = process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1];

  switch (category) {
    case 'core':
      return { routes: coreRoutes, name: 'Core' };
    case 'ai':
      return { routes: aiRoutes, name: 'AI' };
    case 'evidence':
      return { routes: evidenceRoutes, name: 'Evidence' };
    default:
      return { routes: [...coreRoutes, ...aiRoutes, ...evidenceRoutes], name: 'All' };
  }
}

async function main() {
  const { routes, name } = getRoutesToTest();

  await testRoutes(routes, name);

  // Final results
  const duration = ((new Date() - results.startTime) / 1000).toFixed(2);
  const successRate = ((results.passed.length / results.total) * 100).toFixed(2);

  console.log('📊 Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Routes: ${results.total}`);
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️ Duration: ${duration}s`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed Routes:');
    results.failed.forEach(result => {
      console.log(`  - ${result.route}: HTTP ${result.statusCode}`);
    });
  }

  if (results.passed.length > 0) {
    console.log('\n✅ Passed Routes:');
    results.passed.forEach(result => {
      console.log(`  - ${result.route}: HTTP ${result.statusCode}`);
    });
  }

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(console.error);