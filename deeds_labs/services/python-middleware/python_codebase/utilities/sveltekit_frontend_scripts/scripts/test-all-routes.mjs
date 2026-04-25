#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Legal AI Route Testing Suite');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Route categories for organized testing
const routeCategories = {
  'Core Pages': [
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
  ],
  'AI Features': [
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
  ],
  'Evidence Management': [
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
  ],
  'Legal Operations': [
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
  ],
  'Tools & Development': [
    '/tools/search',
    '/tools/editor',
    '/tools/cuda-search',
    '/tools/report-builder',
    '/dev/ai-setup',
    '/dev/cache-demo',
    '/dev/context7-test',
    '/dev/copilot-optimizer',
    '/dev/dynamic-routing-test',
    '/dev/enhanced-processor',
    '/dev/gpu-tiling',
    '/dev/ingest-status',
    '/dev/ingestion-dashboard',
    '/dev/mcp-tools',
    '/dev/metrics',
    '/dev/pgvector-test',
    '/dev/route-explorer',
    '/dev/self-prompting-demo',
    '/dev/suggestions',
    '/dev/tensor-demo',
    '/dev/vector-search-demo',
    '/dev/vite-error-demo',
    '/dev/webgl-fallback-test',
    '/dev/webgpu-diagnostics'
  ],
  'System & Admin': [
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
  ],
  'Demo & Showcase': [
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
  ],
  'Data & Reports': [
    '/reports',
    '/reports-generator',
    '/upload',
    '/upload-test',
    '/import',
    '/export',
    '/gallery',
    '/persons',
    '/persons-of-interest',
    '/poi',
    '/saved-citations'
  ],
  'Advanced Features': [
    '/mcp',
    '/mcp/dashboard',
    '/mcp/demo',
    '/mcp/processor',
    '/brain',
    '/graph',
    '/investigation',
    '/intelligence/contextual',
    '/interactive-canvas',
    '/memory-dashboard',
    '/optimization-dashboard',
    '/state/machines',
    '/state/persistence',
    '/state/transitions'
  ]
};

// Test results storage
const testResults = {
  passed: [],
  failed: [],
  skipped: [],
  total: 0,
  startTime: new Date(),
  endTime: null
};

// Test configuration
const testConfig = {
  baseUrl: 'http://localhost:5173',
  timeout: 10000,
  retries: 2,
  parallel: 5,
  verbose: process.argv.includes('--verbose'),
  categories: process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1]?.split(','),
  exclude: process.argv.find(arg => arg.startsWith('--exclude='))?.split('=')[1]?.split(','),
  include: process.argv.find(arg => arg.startsWith('--include='))?.split('=')[1]?.split(','),
  output: process.argv.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'console'
};

// Helper function to make HTTP requests
async function testRoute(route, retries = testConfig.retries) {
  const url = `${testConfig.baseUrl}${route}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Legal-AI-Route-Tester/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(testConfig.timeout)
      });

      if (response.ok) {
        return {
          route,
          status: response.status,
          statusText: response.statusText,
          success: true,
          attempt,
          url
        };
      } else {
        if (attempt === retries) {
          return {
            route,
            status: response.status,
            statusText: response.statusText,
            success: false,
            attempt,
            url,
            error: `HTTP ${response.status}: ${response.statusText}`
          };
        }
      }
    } catch (error) {
      if (attempt === retries) {
        return {
          route,
          status: 0,
          statusText: 'Network Error',
          success: false,
          attempt,
          url,
          error: error.message
        };
      }
    }
    
    // Wait before retry
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Test a batch of routes in parallel
async function testRouteBatch(routes) {
  const promises = routes.map(route => testRoute(route));
  const results = await Promise.allSettled(promises);
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        route: routes[index],
        status: 0,
        statusText: 'Promise Rejected',
        success: false,
        attempt: 1,
        url: `${testConfig.baseUrl}${routes[index]}`,
        error: result.reason?.message || 'Unknown error'
      };
    }
  });
}

// Filter routes based on configuration
function filterRoutes() {
  let allRoutes = [];
  
  // Get routes from categories
  if (testConfig.categories) {
    testConfig.categories.forEach(category => {
      if (routeCategories[category]) {
        allRoutes = allRoutes.concat(routeCategories[category]);
      }
    });
  } else {
    // Include all routes if no specific categories
    Object.values(routeCategories).forEach(categoryRoutes => {
      allRoutes = allRoutes.concat(categoryRoutes);
    });
  }
  
  // Remove duplicates
  allRoutes = [...new Set(allRoutes)];
  
  // Apply include filter
  if (testConfig.include) {
    allRoutes = allRoutes.filter(route => 
      testConfig.include.some(pattern => route.includes(pattern))
    );
  }
  
  // Apply exclude filter
  if (testConfig.exclude) {
    allRoutes = allRoutes.filter(route => 
      !testConfig.exclude.some(pattern => route.includes(pattern))
    );
  }
  
  return allRoutes;
}

// Generate test report
function generateReport() {
  testResults.endTime = new Date();
  const duration = testResults.endTime - testResults.startTime;
  
  const report = {
    summary: {
      total: testResults.total,
      passed: testResults.passed.length,
      failed: testResults.failed.length,
      skipped: testResults.skipped.length,
      successRate: ((testResults.passed.length / testResults.total) * 100).toFixed(2) + '%',
      duration: `${(duration / 1000).toFixed(2)}s`
    },
    results: {
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped
    },
    config: testConfig,
    timestamp: testResults.startTime.toISOString()
  };
  
  return report;
}

// Save report to file
function saveReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `route-test-report-${timestamp}.json`;
  const filepath = join(projectRoot, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${filename}`);
  
  return filepath;
}

// Main testing function
async function runTests() {
  console.log('🔍 Filtering routes...');
  const routes = filterRoutes();
  
  if (routes.length === 0) {
    console.log('❌ No routes found matching the criteria');
    return;
  }
  
  console.log(`📋 Found ${routes.length} routes to test`);
  
  if (testConfig.verbose) {
    console.log('Routes to test:');
    routes.forEach(route => console.log(`  - ${route}`));
    console.log('');
  }
  
  testResults.total = routes.length;
  
  console.log('🚀 Starting route tests...\n');
  
  // Test routes in batches
  const batchSize = testConfig.parallel;
  for (let i = 0; i < routes.length; i += batchSize) {
    const batch = routes.slice(i, i + batchSize);
    console.log(`Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(routes.length / batchSize)} (${batch.length} routes)...`);
    
    const results = await testRouteBatch(batch);
    
    results.forEach(result => {
      if (result.success) {
        testResults.passed.push(result);
        console.log(`  ✅ ${result.route} (${result.status})`);
      } else {
        testResults.failed.push(result);
        console.log(`  ❌ ${result.route} (${result.status}) - ${result.error}`);
      }
    });
    
    console.log('');
  }
  
  // Generate and display report
  const report = generateReport();
  
  console.log('📊 Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Routes: ${report.summary.total}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⏭️ Skipped: ${report.summary.skipped}`);
  console.log(`📈 Success Rate: ${report.summary.successRate}`);
  console.log(`⏱️ Duration: ${report.summary.duration}`);
  
  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed Routes:');
    testResults.failed.forEach(result => {
      console.log(`  - ${result.route}: ${result.error}`);
    });
  }
  
  // Save report if requested
  if (testConfig.output !== 'console') {
    saveReport(report);
  }
  
  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(testConfig.baseUrl, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if development server is running...');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ Development server is not running!');
    console.log('Please start the server with: npm run dev:quic');
    process.exit(1);
  }
  
  console.log('✅ Development server is running');
  console.log('');
  
  await runTests();
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Legal AI Route Testing Suite

USAGE:
  node scripts/test-all-routes.mjs [OPTIONS]

OPTIONS:
  --verbose              Show detailed output
  --category=CATEGORY    Test specific categories (comma-separated)
  --include=PATTERN      Include routes matching pattern (comma-separated)
  --exclude=PATTERN      Exclude routes matching pattern (comma-separated)
  --output=FORMAT        Output format: 'console' (default) or 'file'
  --help, -h            Show this help message

CATEGORIES:
  core, ai, evidence, legal, tools, system, demo, data, advanced

EXAMPLES:
  node scripts/test-all-routes.mjs                           # Test all routes
  node scripts/test-all-routes.mjs --category=ai,core       # Test AI and core routes
  node scripts/test-all-routes.mjs --include=demo           # Test demo routes only
  node scripts/test-all-routes.mjs --exclude=dev           # Exclude dev routes
  node scripts/test-all-routes.mjs --verbose --output=file # Verbose output, save report
`);
  process.exit(0);
}

// Start testing
main().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
