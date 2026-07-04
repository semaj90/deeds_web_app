#!/usr/bin/env node
/**
 * Phase 8 Readiness Matrix
 *
 * Runs the post-summary alignment checks that prove the query optimization
 * taxonomy is backed by live data and wired commands.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'phase8-readiness-matrix.json');
const MD_REPORT = path.join(REPORT_DIR, 'phase8-readiness-matrix.md');
const NPM_CMD = 'npm';

const checks = [
  { name: 'summary_surface_verify', cmd: NPM_CMD, args: ['run', 'atlas:summary-surface:verify'] },
  { name: 'summary_sanitizer_hardened', cmd: NPM_CMD, args: ['run', 'atlas:summary-sanitizer:hardened:test'] },
  { name: 'summary_layer_clean_dry', cmd: NPM_CMD, args: ['run', 'atlas:summary-layer:clean:dry'] },
  { name: 'phase8_step3_langextract_gate', cmd: NPM_CMD, args: ['run', 'atlas:phase8:step3:langextract:gate'] },
  { name: 'bitfrost_semantic_cache_audit', cmd: NPM_CMD, args: ['run', 'atlas:bitfrost-semantic-cache:audit'] },
  { name: 'tree_nodes_audit', cmd: NPM_CMD, args: ['run', 'atlas:tree-nodes:audit'] },
  { name: 'ontology_kag_readiness', cmd: NPM_CMD, args: ['run', 'atlas:ontology-kag:readiness'] },
  { name: 'ranker_envelope_readiness', cmd: NPM_CMD, args: ['run', 'atlas:ranker-envelope:readiness'] },
  { name: 'acp_transport', cmd: NPM_CMD, args: ['run', 'verify:acp-transport'] },
  { name: 'services_probe', cmd: NPM_CMD, args: ['run', 'atlas:services:probe'] },
  { name: 'embedding_qdrant_turbovec', cmd: NPM_CMD, args: ['run', 'atlas:embedding-qdrant-turbovec:test'] },
  { name: 'gpu_retrieval_summary_fanout', cmd: NPM_CMD, args: ['run', 'atlas:gpu-retrieval-summary-fanout:test'] },
];

function runCheck(check) {
  const startedAt = Date.now();
  const result = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  const durationMs = Date.now() - startedAt;
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  const ok = result.status === 0;

  return {
    name: check.name,
    command: `${check.cmd} ${check.args.join(' ')}`,
    ok,
    duration_ms: durationMs,
    status: ok ? 'PASS' : 'FAIL',
    error: result.error ? String(result.error.message ?? result.error) : '',
    stdout: stdout.slice(-8000),
    stderr: stderr.slice(-8000),
  };
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const results = [];
  let overall = 'PASS';

  for (const check of checks) {
    process.stdout.write(`\n[phase8] ${check.name}...`);
    const result = runCheck(check);
    results.push(result);
    process.stdout.write(` ${result.status} (${result.duration_ms}ms)\n`);
    if (!result.ok) overall = 'WARN';
  }

  const report = {
    generated_at: new Date().toISOString(),
    overall,
    checks: results,
  };

  await fs.writeFile(JSON_REPORT, JSON.stringify(report, null, 2));
  await fs.writeFile(
    MD_REPORT,
    [
      '# Phase 8 Readiness Matrix',
      '',
      `Generated: ${report.generated_at}`,
      `Overall: ${report.overall}`,
      '',
      '| Check | Status | Duration ms | Command |',
      '|---|---|---:|---|',
      ...results.map((r) => `| ${r.name} | ${r.status} | ${r.duration_ms} | \`${r.command}\` |`),
      '',
      '## Notes',
      '',
      '- This matrix is a promotion gate for the query optimization taxonomy.',
      '- Live failures should be fixed before promoting new fanout or accelerator lanes.',
    ].join('\n')
  );

  console.log('\nWrote', JSON_REPORT);
  console.log('Wrote', MD_REPORT);
  console.log(JSON.stringify({ overall, checks: results.map(({ name, status, duration_ms }) => ({ name, status, duration_ms })) }, null, 2));

  process.exitCode = overall === 'PASS' ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
