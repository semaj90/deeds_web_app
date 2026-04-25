#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Legal AI Route Testing Suite (Simple)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Core routes to test
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

// AI routes to test
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

// Evidence routes to test
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

// Legal routes to test
const legalRoutes = [
  '/legal',
  '/legal/documents',
  '/legal/research',
  '/legal/case-theory',
  '/legal/precedent/matching',
  '/legal/detective/motive-analysis',
  '/legal/case/evidence-gallery',
  '/cases',
  '/cases/create',
  '/cases/new',
  '/detective',
  '/detective/canvas',
  '/prosecutor'
];

// Demo routes to test
const demoRoutes = [
  '/demo/showcase',
  '/demo/enhanced-bits-showcase',
  '/showcase-standalone',
  '/nier-showcase',
  '/agent-demo',
  '/ai-test',
  '/cuda-streaming',
  '/webgpu-test',
  '/yorha',
  '/yorha/dashboard',
  '/yorha/analysis',
  '/yorha/components',
  '/yorha/detective',
  '/yorha/persons',
  '/yorha/terminal',
  '/yorha/api-test'
];

// System routes to test
const systemRoutes = [
  '/admin',
  '/admin/redis',
  '/admin/redis/detailed',
  '/admin/users',
  '/admin/performance-dashboard',
  '/system-status',
  '/system-dashboard',
  '/system/health',
  '/endpoints',
  '/status',
  '/healthz'
];

// All routes combined
const allRoutes = [
  ...coreRoutes,
  ...aiRoutes,
  ...evidenceRoutes,
  ...legalRoutes,
  ...demoRoutes,
  ...systemRoutes
];

// Test results
const results = {
  passed: [],
  failed: [],
  total: 0,
  startTime: new Date()
};

// Test a single route using curl
async function testRoute(route) {
  return new Promise((resolve) => {
    const url = `http://localhost:5173${route}`; // Use direct Vite dev server port
    const curl = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let error = '';

    curl.stdout.on('data', (data) => {
      output += data.toString();
    });

    curl.stderr.on('data', (data) => {
      error += data.toString();
    });

    curl.on('close', (code) => {
      const statusCode = parseInt(output.trim()) || 0;
      const success = statusCode >= 200 && statusCode < 400;
      
      resolve({
        route,
        status: statusCode,
        success,
        error: error || (success ? null : `HTTP ${statusCode}`)
      });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      curl.kill();
      resolve({
        route,
        status: 0,
        success: false,
        error: 'Timeout'
      });
    }, 10000);
  });
}

// Test routes in batches
async function testRoutes(routes, batchSize = 5) {
  console.log(`🧪 Testing ${routes.length} routes in batches of ${batchSize}...\n`);
  
  results.total = routes.length;
  
  for (let i = 0; i < routes.length; i += batchSize) {
    const batch = routes.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(routes.length / batchSize);
    
    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} routes):`);
    
    const promises = batch.map(route => testRoute(route));
    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(result => {
      if (result.success) {
        results.passed.push(result);
        console.log(`  ✅ ${result.route} (${result.status})`);
      } else {
        results.failed.push(result);
        console.log(`  ❌ ${result.route} (${result.status}) - ${result.error}`);
      }
    });
    
    console.log('');
  }
}

// Generate summary report
function generateSummary() {
  const endTime = new Date();
  const duration = (endTime - results.startTime) / 1000;
  const successRate = ((results.passed.length / results.total) * 100).toFixed(2);
  
  console.log('📊 Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Routes: ${results.total}`);
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️ Duration: ${duration.toFixed(2)}s`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Routes:');
    results.failed.forEach(result => {
      console.log(`  - ${result.route}: ${result.error}`);
    });
  }
  
  console.log('\n🎯 Route Categories:');
  console.log(`  Core Pages: ${coreRoutes.length}`);
  console.log(`  AI Features: ${aiRoutes.length}`);
  console.log(`  Evidence Management: ${evidenceRoutes.length}`);
  console.log(`  Legal Operations: ${legalRoutes.length}`);
  console.log(`  Demo & Showcase: ${demoRoutes.length}`);
  console.log(`  System & Admin: ${systemRoutes.length}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const category = args.find(arg => arg.startsWith('--category='))?.split('=')[1];
  const verbose = args.includes('--verbose');
  
  let routesToTest = allRoutes;
  
  if (category) {
    switch (category.toLowerCase()) {
      case 'core':
        routesToTest = coreRoutes;
        break;
      case 'ai':
        routesToTest = aiRoutes;
        break;
      case 'evidence':
        routesToTest = evidenceRoutes;
        break;
      case 'legal':
        routesToTest = legalRoutes;
        break;
      case 'demo':
        routesToTest = demoRoutes;
        break;
      case 'system':
        routesToTest = systemRoutes;
        break;
      default:
        console.log(`❌ Unknown category: ${category}`);
        console.log('Available categories: core, ai, evidence, legal, demo, system');
        process.exit(1);
    }
  }
  
  if (verbose) {
    console.log('Routes to test:');
    routesToTest.forEach(route => console.log(`  - ${route}`));
    console.log('');
  }
  
  console.log(`🚀 Starting tests for ${routesToTest.length} routes...\n`);
  
  await testRoutes(routesToTest);
  generateSummary();
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Legal AI Route Testing Suite (Simple)

USAGE:
  node scripts/test-routes-simple.mjs [OPTIONS]

OPTIONS:
  --category=CATEGORY    Test specific category (core, ai, evidence, legal, demo, system)
  --verbose              Show detailed output
  --help, -h            Show this help message

EXAMPLES:
  node scripts/test-routes-simple.mjs                    # Test all routes
  node scripts/test-routes-simple.mjs --category=core    # Test core routes only
  node scripts/test-routes-simple.mjs --category=ai     # Test AI routes only
  node scripts/test-routes-simple.mjs --verbose         # Verbose output
`);
  process.exit(0);
}

// Start testing
main().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
