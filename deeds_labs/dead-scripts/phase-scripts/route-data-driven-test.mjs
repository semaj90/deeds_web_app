#!/usr/bin/env node

/**
 * Route Data-Driven Test & Log System
 *
 * Uses route-organization-report.json to guide testing:
 * 1. Load route metadata (category, priority, functional status)
 * 2. Test routes in priority order (high → medium → low)
 * 3. Log results with structured data
 * 4. Generate reports by category, priority, status
 *
 * Usage:
 *   node route-data-driven-test.mjs [--filter=high] [--category=Core] [--real-only]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(__dirname, '../src/lib/data/route-organization-report.json');
const logsDir = path.join(__dirname, '../.route-test-logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Load route organization report
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

// Parse CLI arguments
const args = process.argv.slice(2);
const filters = {
  priority: null,
  category: null,
  realOnly: false
};

args.forEach(arg => {
  if (arg.startsWith('--priority=')) {
    filters.priority = arg.split('=')[1];
  } else if (arg.startsWith('--category=')) {
    filters.category = arg.split('=')[1];
  } else if (arg === '--real-only') {
    filters.realOnly = true;
  }
});

/**
 * Build route list from report
 */
function buildRouteList() {
  const routes = [];

  for (const [category, data] of Object.entries(report.categories)) {
    const priority = data.priority || 'low';

    for (const route of data.routes || []) {
      routes.push({
        path: route.path,
        category,
        priority,
        functional: route.functional !== false,
        status: route.status || 'active'
      });
    }
  }

  return routes;
}

/**
 * Filter routes based on CLI arguments
 */
function filterRoutes(routes) {
  let filtered = routes;

  if (filters.priority) {
    filtered = filtered.filter(r => r.priority === filters.priority);
  }

  if (filters.category) {
    filtered = filtered.filter(r => r.category === filters.category);
  }

  if (filters.realOnly) {
    filtered = filtered.filter(r => r.functional);
  }

  return filtered;
}

/**
 * Sort routes by priority (high → medium → low)
 */
function sortByPriority(routes) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return routes.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] || 999;
    const bPriority = priorityOrder[b.priority] || 999;
    return aPriority - bPriority;
  });
}

/**
 * Test a single route
 */
async function testRoute(route) {
  const result = {
    path: route.path,
    category: route.category,
    priority: route.priority,
    functional: route.functional,
    timestamp: new Date().toISOString(),
    tests: {
      exists: false,
      accessible: false,
      hasContent: false,
      errors: []
    }
  };

  try {
    // Test 1: Route file exists
    const routeFile = path.join(__dirname, `../src/routes${route.path}/+page.svelte`);
    result.tests.exists = fs.existsSync(routeFile);

    // Test 2: Try to fetch the route (if dev server is running)
    try {
      const response = await fetch(`http://127.0.0.1:5173${route.path}`, {
        timeout: 5000
      });
      result.tests.accessible = response.ok;
      result.tests.hasContent = response.headers.get('content-length') > 0;
    } catch (err) {
      result.tests.errors.push(`Fetch failed: ${err.message}`);
    }

    // Test 3: Check for common issues
    if (result.tests.exists) {
      const content = fs.readFileSync(routeFile, 'utf-8');

      // Check for legacy Svelte patterns
      if (content.includes('export let')) {
        result.tests.errors.push('Uses legacy export let (Svelte 5 incompatible)');
      }
      if (content.includes('onMount')) {
        result.tests.errors.push('Uses onMount (should use $effect)');
      }
      if (content.includes('<slot>')) {
        result.tests.errors.push('Uses deprecated <slot> (should use {@render})');
      }
    }
  } catch (err) {
    result.tests.errors.push(`Test error: ${err.message}`);
  }

  return result;
}

/**
 * Generate test report
 */
function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => !r.tests.errors.length).length,
      failed: results.filter(r => r.tests.errors.length).length,
      byCategory: {},
      byPriority: {}
    },
    results
  };

  // Group by category
  for (const result of results) {
    if (!report.summary.byCategory[result.category]) {
      report.summary.byCategory[result.category] = {
        total: 0,
        passed: 0,
        failed: 0
      };
    }
    report.summary.byCategory[result.category].total++;
    if (result.tests.errors.length) {
      report.summary.byCategory[result.category].failed++;
    } else {
      report.summary.byCategory[result.category].passed++;
    }
  }

  // Group by priority
  for (const result of results) {
    if (!report.summary.byPriority[result.priority]) {
      report.summary.byPriority[result.priority] = {
        total: 0,
        passed: 0,
        failed: 0
      };
    }
    report.summary.byPriority[result.priority].total++;
    if (result.tests.errors.length) {
      report.summary.byPriority[result.priority].failed++;
    } else {
      report.summary.byPriority[result.priority].passed++;
    }
  }

  return report;
}

/**
 * Save test results
 */
function saveResults(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `route-test-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Test results saved to: ${filepath}`);

  return filepath;
}

/**
 * Print test summary
 */
function printSummary(report) {
  console.log('\n' + '='.repeat(80));
  console.log('ROUTE DATA-DRIVEN TEST SUMMARY');
  console.log('='.repeat(80));

  console.log(`\nTotal Routes Tested: ${report.summary.total}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`Pass Rate: ${((report.summary.passed / report.summary.total) * 100).toFixed(1)}%`);

  console.log('\n--- By Category ---');
  for (const [category, stats] of Object.entries(report.summary.byCategory)) {
    const passRate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`${category}: ${stats.passed}/${stats.total} (${passRate}%)`);
  }

  console.log('\n--- By Priority ---');
  for (const [priority, stats] of Object.entries(report.summary.byPriority)) {
    const passRate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`${priority.toUpperCase()}: ${stats.passed}/${stats.total} (${passRate}%)`);
  }

  console.log('\n--- Failed Routes ---');
  const failed = report.results.filter(r => r.tests.errors.length);
  if (failed.length === 0) {
    console.log('None! All routes passed.');
  } else {
    for (const result of failed.slice(0, 10)) {
      console.log(`\n${result.path} [${result.priority}]`);
      for (const error of result.tests.errors) {
        console.log(`  - ${error}`);
      }
    }
    if (failed.length > 10) {
      console.log(`\n... and ${failed.length - 10} more failed routes`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Route Data-Driven Test System');
  console.log(`📊 Loading route organization report...`);

  // Build and filter routes
  let routes = buildRouteList();
  console.log(`📍 Found ${routes.length} total routes`);

  routes = filterRoutes(routes);
  console.log(`🔍 After filtering: ${routes.length} routes`);

  routes = sortByPriority(routes);
  console.log(`📋 Sorted by priority (high → medium → low)`);

  // Run tests
  console.log(`\n🧪 Testing routes in priority order...\n`);
  const results = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    process.stdout.write(`[${i + 1}/${routes.length}] Testing ${route.path}... `);

    const result = await testRoute(route);
    results.push(result);

    if (result.tests.errors.length) {
      console.log(`❌ (${result.tests.errors.length} issues)`);
    } else {
      console.log(`✅`);
    }
  }

  // Generate and save report
  const testReport = generateReport(results);
  saveResults(testReport);
  printSummary(testReport);
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
