#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

import { writeLaneReportV1 } from './lane-report-v1.mjs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DEPENDENCY_TIMEOUT_MS = 20_000;

async function main() {
  console.log('\n=== Cubic Adversarial Tests Lane ===\n');

  const report = {
    timestamp: new Date().toISOString(),
    lane: 'cubic',
    status: 'PASS',
    checks: {},
  };

  let hasFailures = false;

  // 1. Application boundary checks: blank embedding and chat inputs are rejected before inference.
  const frontendRoot = path.join(ROOT, 'sveltekit-frontend');
  const vitestEntrypoint = path.join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs');
  console.log('1. Testing blank embedding and chat inputs at the application boundary…');
  const boundaryTest = spawnSync(process.execPath, [
    vitestEntrypoint,
    'run',
    'src/routes/api/embed/server.route.spec.ts',
    'src/routes/api/ai/chat/server.route.spec.ts',
  ], {
    cwd: frontendRoot,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const boundaryOutput = `${boundaryTest.stdout ?? ''}\n${boundaryTest.stderr ?? ''}`;
  const testSummary = [...boundaryOutput.matchAll(/Tests\s+\d+\s+passed[^\r\n]*/g)].at(-1)?.[0] ?? null;
  const boundaryPassed = boundaryTest.status === 0 && testSummary !== null;
  report.checks.application_input_boundaries = {
    status: boundaryPassed ? 'PASS' : boundaryTest.error || boundaryTest.status === null ? 'BLOCKED' : 'FAIL',
    detail: { exitCode: boundaryTest.status, testSummary, error: boundaryTest.error?.message ?? null },
  };
  if (boundaryTest.stdout) process.stdout.write(boundaryTest.stdout);
  if (boundaryTest.stderr) process.stderr.write(boundaryTest.stderr);
  console.log(`  ${boundaryPassed ? '✅' : report.checks.application_input_boundaries.status === 'BLOCKED' ? '⚠️' : '❌'} Application input boundaries: ${testSummary ?? report.checks.application_input_boundaries.status}`);

  console.log('\n2. Testing Neo4j failure handling without a fallback executor…');
  const fallbackTest = spawnSync(process.execPath, [
    vitestEntrypoint,
    'run',
    'src/lib/server/atlas/graph/graph-expansion-adapter.spec.ts',
    'src/lib/server/atlas/graph/graph-expansion-adapter.unavailable.integration.spec.ts',
  ], {
    cwd: frontendRoot,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const fallbackOutput = `${fallbackTest.stdout ?? ''}\n${fallbackTest.stderr ?? ''}`;
  const fallbackSummary = [...fallbackOutput.matchAll(/Tests\s+\d+\s+passed[^\r\n]*/g)].at(-1)?.[0] ?? null;
  const fallbackPassed = fallbackTest.status === 0 && fallbackSummary !== null;
  report.checks.fallback_simulation = {
    status: fallbackPassed ? 'PASS' : fallbackTest.error || fallbackTest.status === null ? 'BLOCKED' : 'FAIL',
    detail: { scope: 'adapter_no_fallback_fixture_plus_isolated_real_Bolt_refusal', exitCode: fallbackTest.status, testSummary: fallbackSummary, error: fallbackTest.error?.message ?? null },
  };
  if (fallbackTest.stdout) process.stdout.write(fallbackTest.stdout);
  if (fallbackTest.stderr) process.stderr.write(fallbackTest.stderr);
  console.log(`  ${fallbackPassed ? '✅' : report.checks.fallback_simulation.status === 'BLOCKED' ? '⚠️' : '❌'} Neo4j failure/no-fallback fixture: ${fallbackSummary ?? report.checks.fallback_simulation.status}`);

  // 3. Boundary Value Check: Non-existent Qdrant points
  console.log('\n3. Testing Qdrant scroll with non-existent filter…');
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 1,
        filter: {
          must: [{ key: 'source_ref', match: { value: '__codex_nonexistent_probe_20261103__' } }]
        }
      }),
      signal: AbortSignal.timeout(DEPENDENCY_TIMEOUT_MS),
    });
    if (!res.ok) {
      report.checks.qdrant_nonexistent = { status: 'BLOCKED', detail: { http_status: res.status } };
      console.log(`  ⚠️ Qdrant dependency returned HTTP ${res.status}; probe blocked.`);
    } else {
    const data = await res.json();
    const points = data.result?.points ?? [];
    report.checks.qdrant_nonexistent = { status: points.length === 0 ? 'PASS' : 'FAIL', detail: { found: points.length } };
    console.log(`  ${points.length === 0 ? '✅' : '❌'} Qdrant returned ${points.length} points for non-existent file path.`);
    if (points.length > 0) hasFailures = true;
    }
  } catch (err) {
    report.checks.qdrant_nonexistent = { status: 'BLOCKED', detail: `unavailable: ${err.message}` };
    console.log(`  ⚠️ Qdrant non-existent filter probe blocked: ${err.message}`);
  }

  console.log('\n4. Recording the declared graph failure policy…');
  report.checks.fallback_behavior = {
    status: 'BLOCKED',
    detail: {
      scope: 'production_retrieval_fallback_not_exercised',
      liveNeo4jInterrupted: false,
      alternateExecutorInvoked: false,
      expectedOutcome: 'BLOCKED_PRODUCTION_FALLBACK_UNEXERCISED',
      testSummary: fallbackSummary,
      adapterFailClosedEvidence: fallbackPassed ? 'PASS' : 'NOT_PROVEN',
      note: 'Adapter fail-closed tests do not prove that the production retrieval route selects and invokes its configured fallback with provenance.'
    }
  };
  console.log(`  ⚠️ Production retrieval fallback: BLOCKED; adapter fixture ${fallbackPassed ? 'passed' : 'not proven'}.`);

  const checkStatuses = Object.values(report.checks).map((check) => check.status);
  report.status = hasFailures || checkStatuses.includes('FAIL')
    ? 'FAIL'
    : checkStatuses.length > 0 && checkStatuses.every((status) => status === 'PASS')
      ? 'PASS'
      : 'PARTIAL';
  if (report.status !== 'PASS') process.exitCode = 1;

  // Save report
  const reportPath = writeLaneReportV1('cubic', report);
  console.log(`\nCubic adversarial lane report saved to ${path.relative(ROOT, reportPath)} with status: ${report.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
