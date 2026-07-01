#!/usr/bin/env node
/**
 * validate-rg-search-repo.mjs
 *
 * Validates optional rg (ripgrep) search integration for the repository.
 * Performs three checks:
 *   1. Docker containers: legal-ai-postgres, legal-ai-redis, legal-ai-qdrant
 *   2. rg binary: Available in PATH or via npm
 *   3. Scripts wiring: Verify search integration points exist
 *
 * Usage:
 *   node scripts/validate-rg-search-repo.mjs [--verbose] [--docker-only] [--rg-only] [--wiring-only]
 *
 * Exit codes:
 *   0 = All checks pass
 *   1 = One or more checks failed
 *   2 = Fatal error (e.g., Docker not installed)
 */

import { execSync, exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_CONTAINERS = [
  { name: 'legal-ai-postgres', port: 5432, purpose: 'Database (search index metadata)' },
  { name: 'legal-ai-redis', port: 6379, purpose: 'Cache (query results)' },
  { name: 'legal-ai-qdrant', port: 6333, purpose: 'Vector store (ANN search)' }
];

const WIRING_CHECKS = [
  {
    name: 'rg-search API endpoint',
    path: 'src/routes/api/search/rg/+server.ts',
    pattern: /export\s+(async\s+)?function\s+(GET|POST|DELETE)/,
    description: 'Full-text search endpoint'
  },
  {
    name: 'Search orchestrator',
    path: 'src/lib/server/search/rg-search-orchestrator.ts',
    pattern: /export\s+(async\s+)?function\s+search/,
    description: 'Orchestrates rg + Qdrant + Neo4j search'
  },
  {
    name: 'rg bridge client',
    path: 'src/lib/server/search/rg-bridge.ts',
    pattern: /export\s+(async\s+)?function\s+runRgSearch/,
    description: 'Subprocess wrapper for rg CLI'
  },
  {
    name: 'Search results aggregator',
    path: 'src/lib/server/search/search-results-aggregator.ts',
    pattern: /export\s+(async\s+)?function\s+aggregate/,
    description: 'Merges rg + Qdrant + Neo4j results'
  },
  {
    name: 'npm scripts',
    path: 'package.json',
    pattern: /"search:rg":\s*"/,
    description: 'npm run search:rg command'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function log(message, level = 'info') {
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray
  };
  console.log(`${colors[level](`[${level.toUpperCase()}]`)} ${message}`);
}

function checkCommand(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    log(`Failed to read ${filePath}: ${err.message}`, 'error');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Docker Validation
// ─────────────────────────────────────────────────────────────────────────────

async function validateDocker() {
  log('\n════════════════════════════════════════════════════════════════');
  log('DOCKER CONTAINER VALIDATION');
  log('════════════════════════════════════════════════════════════════');

  // Check if Docker is installed
  if (!checkCommand('docker --version')) {
    log('Docker is not installed or not in PATH', 'error');
    return { ok: false, fatal: true };
  }

  log('Docker is installed', 'success');

  const results = [];

  for (const container of REQUIRED_CONTAINERS) {
    try {
      const output = execSync(
        `docker ps --filter "name=${container.name}" --format "{{.State}}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();

      if (output === 'running') {
        log(`✓ ${container.name} (port ${container.port}) — ${container.purpose}`, 'success');
        results.push({ name: container.name, ok: true, running: true });
      } else if (output) {
        log(`⚠ ${container.name} exists but not running (state: ${output})`, 'warn');
        results.push({ name: container.name, ok: false, running: false, state: output });
      } else {
        log(`✗ ${container.name} not found`, 'error');
        results.push({ name: container.name, ok: false, exists: false });
      }
    } catch (err) {
      log(`✗ Failed to check ${container.name}: ${err.message}`, 'error');
      results.push({ name: container.name, ok: false, error: err.message });
    }
  }

  const allRunning = results.every((r) => r.ok && r.running);
  const allExist = results.every((r) => r.ok);

  if (allRunning) {
    log('\n✓ All required containers are running', 'success');
  } else if (allExist) {
    log('\n⚠ All containers exist but some are not running', 'warn');
    log('Start missing containers with: docker-compose up -d', 'info');
  } else {
    log('\n✗ Some containers are missing or stopped', 'error');
  }

  return { ok: allRunning, partial: allExist && !allRunning, containers: results };
}

// ─────────────────────────────────────────────────────────────────────────────
// rg Binary Validation
// ─────────────────────────────────────────────────────────────────────────────

async function validateRgBinary() {
  log('\n════════════════════════════════════════════════════════════════');
  log('RG (RIPGREP) BINARY VALIDATION');
  log('════════════════════════════════════════════════════════════════');

  // Check system rg
  if (checkCommand('rg --version')) {
    const version = execSync('rg --version', { encoding: 'utf-8' }).trim();
    log(`✓ rg found in PATH: ${version}`, 'success');
    return { ok: true, source: 'system', version };
  }

  // Check npm-installed rg
  const npmRgPath = resolve('node_modules/.bin/rg');
  if (existsSync(npmRgPath)) {
    const version = execSync(`${npmRgPath} --version`, { encoding: 'utf-8' }).trim();
    log(`✓ rg found in node_modules: ${version}`, 'success');
    return { ok: true, source: 'npm', path: npmRgPath, version };
  }

  // Check if @vscode/ripgrep is installed
  const vscodeRgPath = resolve('node_modules/@vscode/ripgrep/bin/rg');
  if (existsSync(vscodeRgPath)) {
    const version = execSync(`${vscodeRgPath} --version`, { encoding: 'utf-8' }).trim();
    log(`✓ rg found in @vscode/ripgrep: ${version}`, 'success');
    return { ok: true, source: '@vscode/ripgrep', path: vscodeRgPath, version };
  }

  log('✗ rg binary not found', 'error');
  log('Install with: npm install -g ripgrep', 'info');
  log('Or add to devDependencies: npm install --save-dev ripgrep', 'info');

  return { ok: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripts Wiring Validation
// ─────────────────────────────────────────────────────────────────────────────

async function validateScriptsWiring() {
  log('\n════════════════════════════════════════════════════════════════');
  log('SCRIPTS WIRING VALIDATION');
  log('════════════════════════════════════════════════════════════════');

  const results = [];
  const basePath = resolve('.');

  for (const check of WIRING_CHECKS) {
    const filePath = resolve(basePath, check.path);

    if (!existsSync(filePath)) {
      log(`✗ ${check.name}`, 'error');
      log(`   Path: ${check.path}`, 'debug');
      log(`   ${check.description}`, 'info');
      results.push({ ...check, ok: false, exists: false });
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      if (check.pattern.test(content)) {
        log(`✓ ${check.name}`, 'success');
        log(`   ${check.description}`, 'debug');
        results.push({ ...check, ok: true });
      } else {
        log(`⚠ ${check.name} exists but pattern not found`, 'warn');
        log(`   Expected pattern: ${check.pattern}`, 'debug');
        results.push({ ...check, ok: false, patternMissing: true });
      }
    } catch (err) {
      log(`✗ ${check.name} — read error: ${err.message}`, 'error');
      results.push({ ...check, ok: false, error: err.message });
    }
  }

  const allOk = results.every((r) => r.ok);
  const missingFiles = results.filter((r) => !r.exists);
  const patternIssues = results.filter((r) => r.patternMissing);

  if (allOk) {
    log('\n✓ All wiring checks pass', 'success');
  } else {
    if (missingFiles.length > 0) {
      log(`\n✗ ${missingFiles.length} file(s) missing:`, 'error');
      missingFiles.forEach((f) => {
        log(`   - ${f.path}`, 'error');
      });
    }
    if (patternIssues.length > 0) {
      log(`\n⚠ ${patternIssues.length} file(s) have pattern issues:`, 'warn');
      patternIssues.forEach((f) => {
        log(`   - ${f.path}`, 'warn');
      });
    }
  }

  return { ok: allOk, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration Test
// ─────────────────────────────────────────────────────────────────────────────

async function runIntegrationTest(rgResult) {
  log('\n════════════════════════════════════════════════════════════════');
  log('INTEGRATION TEST (OPTIONAL)');
  log('════════════════════════════════════════════════════════════════');

  if (!rgResult.ok) {
    log('⚠ Skipping integration test (rg not available)', 'warn');
    return { ok: false, skipped: true };
  }

  const rgCmd = rgResult.path || 'rg';
  const testQuery = 'export function';
  const testDir = 'src/lib/server';

  try {
    log(`Running: ${rgCmd} "${testQuery}" ${testDir}`, 'debug');
    const output = execSync(`${rgCmd} "${testQuery}" ${testDir} --color never`, {
      encoding: 'utf-8',
      timeout: 5000
    });

    const lines = output.split('\n').filter((line) => line.trim());
    log(`✓ Integration test passed: found ${lines.length} matches`, 'success');
    log(`   Sample: ${lines[0] || '(no output)'}`, 'debug');

    return { ok: true, matches: lines.length };
  } catch (err) {
    if (err.code === 'ETIMEDOUT') {
      log('✗ Integration test timed out', 'error');
    } else {
      log(`✗ Integration test failed: ${err.message}`, 'error');
    }
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const dockerOnly = args.includes('--docker-only');
  const rgOnly = args.includes('--rg-only');
  const wiringOnly = args.includes('--wiring-only');

  log('');
  log('╔════════════════════════════════════════════════════════════════╗');
  log('║   RG SEARCH REPOSITORY VALIDATION                             ║');
  log('║   Validates Docker, rg binary, and scripts wiring              ║');
  log('╚════════════════════════════════════════════════════════════════╝');

  const results = {
    docker: null,
    rg: null,
    wiring: null,
    integration: null,
    timestamp: new Date().toISOString()
  };

  // Docker validation
  if (!rgOnly && !wiringOnly) {
    results.docker = await validateDocker();
    if (results.docker.fatal) {
      log('\n✗ Fatal error: Docker is required', 'error');
      process.exit(2);
    }
  }

  if (dockerOnly) {
    process.exit(results.docker.ok ? 0 : 1);
  }

  // rg binary validation
  if (!dockerOnly && !wiringOnly) {
    results.rg = await validateRgBinary();
  }

  if (rgOnly) {
    process.exit(results.rg.ok ? 0 : 1);
  }

  // Scripts wiring validation
  if (!dockerOnly && !rgOnly) {
    results.wiring = await validateScriptsWiring();
  }

  if (wiringOnly) {
    process.exit(results.wiring.ok ? 0 : 1);
  }

  // Integration test (optional)
  if (results.rg && results.rg.ok) {
    results.integration = await runIntegrationTest(results.rg);
  }

  // Summary
  log('\n════════════════════════════════════════════════════════════════');
  log('VALIDATION SUMMARY');
  log('════════════════════════════════════════════════════════════════');

  const allChecks = [
    { name: 'Docker Containers', result: results.docker, required: true },
    { name: 'rg Binary', result: results.rg, required: true },
    { name: 'Scripts Wiring', result: results.wiring, required: true },
    { name: 'Integration Test', result: results.integration, required: false }
  ];

  allChecks.forEach(({ name, result, required }) => {
    if (!result) return;
    const status = result.ok ? '✓' : result.fatal ? '✗' : '⚠';
    const color = result.ok ? 'success' : 'error';
    const req = required ? ' (required)' : ' (optional)';
    log(`${status} ${name}${req}`, color);
  });

  const requiredChecks = allChecks.filter((c) => c.required);
  const requiredPassed = requiredChecks.filter((c) => c.result && c.result.ok);
  const allPassed = requiredPassed.length === requiredChecks.length;

  log('');
  if (allPassed) {
    log('✓ RG SEARCH INTEGRATION IS READY', 'success');
    log('');
    log('Next steps:', 'info');
    log('  1. npm run search:rg -- --query "export function" src/lib/server', 'debug');
    log('  2. curl http://localhost:5173/api/search/rg?q=export%20function', 'debug');
  } else {
    log('✗ RG SEARCH INTEGRATION NEEDS SETUP', 'error');
    log('');
    log('Missing components:', 'info');
    requiredChecks.forEach(({ name, result }) => {
      if (!result || !result.ok) {
        log(`  - ${name}`, 'error');
      }
    });
  }

  log('');
  log('════════════════════════════════════════════════════════════════');

  if (verbose) {
    log('\nDetailed results:', 'debug');
    console.log(JSON.stringify(results, null, 2));
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'error');
  process.exit(2);
});
