#!/usr/bin/env node
/**
 * Tool Gateway Integration Test Script
 *
 * Tests the Gemma4 tool gateway routing, execution, and diagnostics.
 * Run: node scripts/test-tool-gateway.mjs [options]
 *
 * Options:
 *   --url <base>        API base URL (default: http://localhost:5173)
 *   --tool <name>       Test specific tool (default: test all)
 *   --verbose           Show detailed output
 *   --export <file>     Export report to JSON file
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const baseUrl = args.find(a => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:5173';
const toolFilter = args.find(a => a.startsWith('--tool='))?.split('=')[1];
const verbose = args.includes('--verbose');
const exportFile = args.find(a => a.startsWith('--export='))?.split('=')[1];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testDiagnosticEndpoint() {
  log('\n═══ Test 1: Diagnostics Endpoint ═══', 'blue');

  try {
    const res = await fetch(`${baseUrl}/api/agent/rpc?diagnostic=summary`, {
      timeout: 5000,
    });

    if (!res.ok) {
      log(`✗ HTTP ${res.status}`, 'red');
      return false;
    }

    const data = await res.json();
    log(`✓ Diagnostics accessible`, 'green');

    if (verbose) {
      log(`\n  Total Requests: ${data.totalRequests}`, 'cyan');
      log(`  Success Rate: ${((data.successCount / (data.totalRequests || 1)) * 100).toFixed(1)}%`, 'cyan');
      log(`  Avg Duration: ${data.averageDurationMs.toFixed(0)}ms`, 'cyan');
      log(`  Tools Used: ${Object.keys(data.toolDistribution).join(', ')}`, 'cyan');
    }

    return true;
  } catch (err) {
    log(`✗ ${err.message}`, 'red');
    return false;
  }
}

async function testToolsListEndpoint() {
  log('\n═══ Test 2: Tools List Endpoint ═══', 'blue');

  try {
    const res = await fetch(`${baseUrl}/api/agent/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
      timeout: 5000,
    });

    if (!res.ok) {
      log(`✗ HTTP ${res.status}`, 'red');
      return false;
    }

    const data = await res.json();

    if (!data.result || !Array.isArray(data.result.available_tools)) {
      log('✗ Invalid response structure', 'red');
      return false;
    }

    const tools = data.result.available_tools;
    log(`✓ Tools endpoint accessible (${tools.length} tools)`, 'green');

    if (verbose && tools.length > 0) {
      log(`\n  Available Tools:`, 'cyan');
      tools.slice(0, 10).forEach(t => log(`    - ${t}`, 'cyan'));
      if (tools.length > 10) {
        log(`    ... and ${tools.length - 10} more`, 'cyan');
      }
    }

    return true;
  } catch (err) {
    log(`✗ ${err.message}`, 'red');
    return false;
  }
}

async function testToolDispatch() {
  log('\n═══ Test 3: Tool Dispatch ═══', 'blue');

  try {
    // Try a simple read-only tool that should exist
    const res = await fetch(`${baseUrl}/api/agent/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'topology-status',
          arguments: {},
        },
        id: 1,
      }),
      timeout: 5000,
    });

    if (!res.ok) {
      log(`✗ HTTP ${res.status}`, 'red');
      return false;
    }

    const data = await res.json();

    if (data.error) {
      log(`✗ RPC Error: ${data.error.message}`, 'yellow');
      return false;
    }

    log(`✓ Tool dispatch working`, 'green');

    if (verbose && data.result) {
      log(`\n  Result Type: ${typeof data.result}`, 'cyan');
      if (typeof data.result === 'object') {
        log(`  Result Keys: ${Object.keys(data.result).join(', ')}`, 'cyan');
      }
    }

    return true;
  } catch (err) {
    log(`✗ ${err.message}`, 'red');
    return false;
  }
}

async function testDiagnosticCapture() {
  log('\n═══ Test 4: Diagnostic Capture ═══', 'blue');

  try {
    // Clear diagnostics
    await fetch(`${baseUrl}/api/agent/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/diagnostics',
        params: { type: 'clear' },
      }),
      timeout: 5000,
    });

    // Make a tool call
    await fetch(`${baseUrl}/api/agent/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'topology-status',
          arguments: {},
        },
        id: 1,
      }),
      timeout: 5000,
    });

    // Get diagnostic log
    const logRes = await fetch(`${baseUrl}/api/agent/rpc?diagnostic=log&tool=topology-status`, {
      timeout: 5000,
    });

    if (!logRes.ok) {
      log(`✗ HTTP ${logRes.status}`, 'red');
      return false;
    }

    const log_data = await logRes.json();

    if (!Array.isArray(log_data.log) || log_data.log.length === 0) {
      log(`✗ No diagnostic entries captured`, 'yellow');
      return false;
    }

    const phases = [...new Set(log_data.log.map(e => e.phase))];
    log(`✓ Diagnostics captured (${log_data.log.length} entries, ${phases.length} phases)`, 'green');

    if (verbose) {
      log(`\n  Phases: ${phases.join(', ')}`, 'cyan');
      log_data.log.slice(0, 3).forEach(entry => {
        log(`    [${entry.phase}] ${entry.message}`, 'cyan');
      });
    }

    return true;
  } catch (err) {
    log(`✗ ${err.message}`, 'red');
    return false;
  }
}

async function testHealthProbe() {
  log('\n═══ Test 5: Health Probe (Dependencies) ═══', 'blue');

  const probes = [
    {
      name: 'Dev Server',
      url: `${baseUrl}/`,
      check: (status) => status === 200,
    },
    {
      name: 'Ollama (optional)',
      url: 'http://localhost:11434/api/tags',
      check: (status) => status === 200,
      optional: true,
    },
    {
      name: 'Qdrant (optional)',
      url: 'http://localhost:6333/',
      check: (status) => status >= 200 && status < 400,
      optional: true,
    },
  ];

  let passed = 0;

  for (const probe of probes) {
    try {
      const res = await fetch(probe.url, { timeout: 2000 });
      const success = probe.check(res.status);

      if (success) {
        log(`  ✓ ${probe.name}`, 'green');
        passed++;
      } else if (probe.optional) {
        log(`  ~ ${probe.name} (optional, returned ${res.status})`, 'yellow');
        passed++;
      } else {
        log(`  ✗ ${probe.name} (HTTP ${res.status})`, 'red');
      }
    } catch (err) {
      if (probe.optional) {
        log(`  ~ ${probe.name} (optional, unavailable)`, 'yellow');
        passed++;
      } else {
        log(`  ✗ ${probe.name} (${err.message})`, 'red');
      }
    }
  }

  return passed === probes.length;
}

async function testRunDiagnosticSuite() {
  log('\n═══ Test 6: Diagnostic Test Suite ═══', 'blue');

  try {
    const res = await fetch(`${baseUrl}/api/agent/rpc/test`, {
      timeout: 10000,
    });

    if (!res.ok) {
      log(`✗ HTTP ${res.status}`, 'red');
      return false;
    }

    const data = await res.json();

    log(`✓ Test suite completed: ${data.summary.message}`,
      data.summary.success ? 'green' : 'yellow'
    );

    if (verbose && data.results) {
      log('\n  Test Results:', 'cyan');
      data.results.forEach(result => {
        const icon = result.passed ? '✓' : '✗';
        const color = result.passed ? 'green' : 'red';
        log(`    ${icon} ${result.name} (${result.duration}ms)`, 'cyan');
        if (!result.passed && result.error) {
          log(`       ${result.error}`, 'red');
        }
      });

      if (data.recommendations && data.recommendations.length > 0) {
        log('\n  Recommendations:', 'cyan');
        data.recommendations.forEach(rec => {
          log(`    • ${rec}`, 'cyan');
        });
      }
    }

    return data.summary.success;
  } catch (err) {
    log(`✗ ${err.message}`, 'red');
    return false;
  }
}

async function main() {
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  Tool Gateway Integration Test Suite  ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');

  log(`\nConnecting to: ${baseUrl}`, 'cyan');
  if (verbose) log('Verbose mode: ON', 'cyan');
  if (toolFilter) log(`Tool filter: ${toolFilter}`, 'cyan');

  const results = [];

  // Run tests
  results.push(await testHealthProbe());
  results.push(await testDiagnosticEndpoint());
  results.push(await testToolsListEndpoint());
  results.push(await testToolDispatch());
  results.push(await testDiagnosticCapture());
  results.push(await testRunDiagnosticSuite());

  // Summary
  log('\n╔════════════════════════════════════════╗', 'blue');
  const passed = results.filter(Boolean).length;
  const total = results.length;
  const success = passed === total;

  log(`║  ${success ? 'PASSED' : 'FAILED'}: ${passed}/${total} tests                    ║`, success ? 'green' : 'red');
  log('╚════════════════════════════════════════╝', success ? 'green' : 'red');

  // Export report if requested
  if (exportFile) {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl,
      testResults: {
        passed,
        total,
        success,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    try {
      await fs.writeFile(exportFile, JSON.stringify(report, null, 2));
      log(`\n📁 Report exported to: ${exportFile}`, 'green');
    } catch (err) {
      log(`\n⚠️  Failed to export report: ${err.message}`, 'red');
    }
  }

  process.exit(success ? 0 : 1);
}

main().catch(err => {
  log(`\nFatal Error: ${err.message}`, 'red');
  process.exit(1);
});
