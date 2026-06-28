#!/usr/bin/env node

/**
 * PHASE 85 P0: INVENTORY AND DUPLICATE GUARD
 *
 * Build comprehensive inventory of:
 *   1. Production-path stub functions (not research-only)
 *   2. Canonical owners for each capability
 *   3. Mock/TODO patterns that block production
 *   4. Supersedes ranking opportunities
 *
 * Output: .tmp/phase85-mock-stub-inventory.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PRODUCTION_PATHS = [
  'sveltekit-frontend/src/lib/server/generation',
  'sveltekit-frontend/src/lib/server/indexer',
  'sveltekit-frontend/src/lib/server/cache',
  'sveltekit-frontend/src/lib/server/retrieval',
  'sveltekit-frontend/src/lib/server/ai',
  'packages/atlas-core/src',
  'sveltekit-frontend/src/routes/api/atlas',
  'sveltekit-frontend/scripts/atlas',
];

const RESEARCH_PATHS = [
  'sveltekit-frontend/src/routes/(app)/demos',
  'sveltekit-frontend/src/lib/experimental',
  'sveltekit-frontend/src/routes/(app)/gpu-evidence-graph',
];

const CAPABILITIES = {
  semantic_diff: {
    files: ['semantic-diff-gate.ts', 'cross-encoder-reranker.ts'],
    owner: 'semantic-diff-gate.ts',
    critical: true,
  },
  artifact_registry: {
    files: ['artifact-logger.ts', 'atlas-artifacts.ts'],
    owner: 'artifact-logger.ts',
    critical: true,
  },
  summary_extraction: {
    files: ['code-llm-index.ts', 'packet-summary-pipeline.ts'],
    owner: 'packet-summary-pipeline.ts',
    critical: true,
  },
  feature_labels: {
    files: ['feature-builder.ts', 'agents-context-source.ts'],
    owner: 'feature-builder.ts',
    critical: false,
  },
  gan_validation: {
    files: ['glyph-diffusion-service.ts', 'gan-audit.ts'],
    owner: 'glyph-diffusion-service.ts',
    critical: false,
  },
  reward_scoring: {
    files: ['atlas-reward-cache.ts', 'compile-reward-scoring.ts'],
    owner: 'atlas-reward-cache.ts',
    critical: false,
  },
  replay_export: {
    files: ['replay-export.ts', 'agent-traces.ts'],
    owner: 'replay-export.ts',
    critical: false,
  },
  git_diff_supersedes: {
    files: ['git-diff-supersedes-reconcile-production.mjs', 'git-diff-parser.ts'],
    owner: 'git-diff-supersedes-reconcile-production.mjs',
    critical: true,
  },
};

function findFileByName(name) {
  // Use rg to search for the file with a glob pattern
  const result = spawnSync('rg', ['--files', '-g', `*${name}`], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  return (result.stdout || '')
    .split('\n')
    .filter(Boolean)
    .filter(
      (file) =>
        !file.includes('node_modules') &&
        !file.includes('.claude/worktrees') &&
        !file.includes('.claude\\worktrees')
    );
}

function runGrep(pattern, paths) {
  const args = ['-r', pattern, '--type', 'ts', '--type', 'mjs', '-n', ...paths];
  const result = spawnSync('rg', args, { encoding: 'utf-8', cwd: process.cwd() });

  return result.stdout
    ?.split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const [file, lineNum, ...rest] = line.split(':');
      return { file, lineNum: parseInt(lineNum), content: rest.join(':').trim() };
    }) || [];
}

function inventory() {
  const report = {
    timestamp: new Date().toISOString(),
    version: '0.1',
    capabilities: {},
    production_stubs: [],
    research_only_stubs: [],
    statistics: {
      total_capabilities: Object.keys(CAPABILITIES).length,
      critical_capabilities: 0,
      production_stubs_found: 0,
      research_stubs_found: 0,
      owned_capabilities: 0,
      orphan_capabilities: 0,
    },
  };

  console.log('📊 PHASE 85 P0: INVENTORY\n');
  console.log('Scanning production capabilities...\n');

  // Scan each capability
  for (const [capName, capDef] of Object.entries(CAPABILITIES)) {
    console.log(`  🔍 ${capName}`);

    const ownerMatches = findFileByName(capDef.owner);
    const ownerExists = ownerMatches.length > 0;

    report.capabilities[capName] = {
      owner: capDef.owner,
      owner_exists: ownerExists,
      owner_matches: ownerMatches,
      files: capDef.files,
      critical: capDef.critical,
      stubs_found: 0,
      mocks_found: 0,
      todos_found: 0,
      status: ownerExists ? 'OWNED' : 'ORPHAN',
    };

    if (ownerExists) {
      report.statistics.owned_capabilities++;
      console.log(`      ✅ Found: ${ownerMatches.join(', ')}`);
    } else {
      report.statistics.orphan_capabilities++;
      console.log(`      ❌ Not found`);
    }

    if (capDef.critical) {
      report.statistics.critical_capabilities++;
    }
  }

  // Scan production paths for stubs
  console.log('\nScanning production paths for stubs/mocks...\n');

  const prodStubs = runGrep('(return \\[\\]|return \\{\\}|mock|stub)', PRODUCTION_PATHS);
  const resStubs = runGrep('(return \\[\\]|return \\{\\}|mock|stub)', RESEARCH_PATHS);

  for (const stub of prodStubs) {
    if (!stub.file.includes('node_modules')) {
      report.production_stubs.push(stub);
      report.statistics.production_stubs_found++;
      console.log(`    ⚠️  ${stub.file}:${stub.lineNum}`);
    }
  }

  for (const stub of resStubs) {
    if (!stub.file.includes('node_modules')) {
      report.research_only_stubs.push(stub);
      report.statistics.research_stubs_found++;
    }
  }

  // Scan for TODOs in production paths
  console.log('\nScanning for production TODOs...\n');

  const todos = runGrep('TODO|FIXME|NotImplemented', PRODUCTION_PATHS);
  for (const todo of todos.slice(0, 20)) {
    console.log(`    📝 ${todo.file}:${todo.lineNum}`);
    report.production_stubs.push(todo);
    report.statistics.production_stubs_found++;
  }

  console.log(`\n───────────────────────────────────────────────────────────────────\n`);

  // Summary
  console.log('SUMMARY:\n');
  console.log(`  ✅ Owned capabilities:    ${report.statistics.owned_capabilities} / ${report.statistics.total_capabilities}`);
  console.log(`  ❌ Orphan capabilities:   ${report.statistics.orphan_capabilities}`);

  // Real critical orphans check
  const criticalOrphans = Object.entries(report.capabilities)
    .filter(([, cap]) => cap.critical && cap.status === 'ORPHAN')
    .map(([name]) => name);

  console.log(`  🔴 Critical orphans:      ${criticalOrphans.length}`);
  console.log(`  ⚠️  Production stubs:      ${report.statistics.production_stubs_found}`);
  console.log(`  📚 Research-only stubs:   ${report.statistics.research_stubs_found}\n`);

  // Write report
  const reportPath = '.tmp/phase85-mock-stub-inventory.json';
  fs.mkdirSync('.tmp', { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`📄 Full report: ${reportPath}\n`);

  // Blocking capability check
  if (criticalOrphans.length > 0) {
    console.log(`🚨 CRITICAL ORPHANS (must own):`);
    for (const cap of criticalOrphans) {
      console.log(`    - ${cap}`);
    }
    console.log('');
  }

  return report;
}

const report = inventory();
process.exit(report.statistics.critical_capabilities > 0 ? 1 : 0);