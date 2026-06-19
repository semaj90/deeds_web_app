#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const ENDPOINT = process.env.HYPERRAG_PACKET_RPC_URL ?? 'http://127.0.0.1:5173/api/hyperrag/packet-rpc';
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'runtime-degradation-proof.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'runtime-degradation-proof.md');
const QUERY = 'find parent atlas identity spine and retrieval fallback';

const SERVICES = [
  {
    name: 'valkey',
    container: 'legal-ai-valkey',
    expected: 'cache miss fallback',
  },
  {
    name: 'neo4j',
    container: 'legal-ai-neo4j',
    expected: 'graph skipped with lexical/dense retrieval preserved',
  },
  {
    name: 'qdrant',
    container: 'legal-ai-qdrant',
    expected: 'FTS fallback preserved',
  },
];

function docker(args, timeout = 120_000) {
  const result = spawnSync('docker', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitContainer(container, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inspect = docker([
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      container,
    ], 10_000);
    if (inspect.ok && ['healthy', 'running'].includes(inspect.stdout.trim())) return inspect.stdout.trim();
    await sleep(2_000);
  }
  return 'timeout';
}

async function queryRpc() {
  const started = Date.now();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        limit: 5,
        includeGraph: true,
        useFts: true,
        recordTelemetry: false,
        useExactMatchCache: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok && body.ok === true && Array.isArray(body.packets) && body.packets.length > 0,
      http_status: response.status,
      packets: Array.isArray(body.packets) ? body.packets.length : 0,
      strategy: body.trace?.retrieval_strategy ?? null,
      cache_source: body.trace?.cache_source ?? null,
      duration_ms: Date.now() - started,
      error: body.error ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      http_status: 0,
      packets: 0,
      strategy: null,
      cache_source: null,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    OUT_MD,
    [
      '# Runtime Degradation Proof',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.summary.status}`,
      '',
      '| Service stopped | Expected behavior | Packets | Strategy | Restored | Status |',
      '|---|---|---:|---|---|---|',
      ...report.tests.map((row) =>
        `| ${row.name} | ${row.expected} | ${row.query.packets} | ${row.query.strategy ?? 'n/a'} | ${row.restore_status} | ${row.passed ? 'PASS' : 'FAIL'} |`
      ),
      '',
      '- Postgres was never stopped or mutated.',
      '- Each mirror service was restarted in a finally block.',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function main() {
  if (!APPLY) {
    const report = {
      generated_at: new Date().toISOString(),
      mode: 'DRY_RUN',
      services: SERVICES,
      note: 'Pass --apply to perform bounded stop/query/start tests.',
    };
    await writeReport({ ...report, tests: [], summary: { status: 'DRY_RUN' } });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const baseline = await queryRpc();
  if (!baseline.ok) throw new Error(`Baseline packet RPC failed: ${baseline.error ?? baseline.http_status}`);

  const tests = [];
  for (const service of SERVICES) {
    let stopped = false;
    let restoreStatus = 'not-started';
    const row = { ...service, stop: null, query: null, restore_status: null, passed: false };
    try {
      const stop = docker(['stop', '--time', '15', service.container]);
      row.stop = stop;
      stopped = stop.ok;
      if (!stop.ok) throw new Error(`docker stop failed: ${stop.stderr}`);
      await sleep(2_000);
      row.query = await queryRpc();
    } catch (error) {
      row.query ??= { ok: false, packets: 0, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (stopped) docker(['start', service.container]);
      restoreStatus = await waitContainer(service.container);
      row.restore_status = restoreStatus;
      row.passed = Boolean(row.query?.ok) && ['healthy', 'running'].includes(restoreStatus);
      tests.push(row);
      console.log(`[degradation] ${service.name}: ${row.passed ? 'PASS' : 'FAIL'} packets=${row.query?.packets ?? 0} restore=${restoreStatus}`);
    }
  }

  const report = {
    schema: 'runtime_degradation_proof.v1',
    generated_at: new Date().toISOString(),
    mode: 'APPLY',
    baseline,
    tests,
    summary: {
      passed: tests.filter((row) => row.passed).length,
      failed: tests.filter((row) => !row.passed).length,
      status: tests.every((row) => row.passed) ? 'PASS' : 'FAIL',
    },
  };
  await writeReport(report);
  console.log(JSON.stringify(report.summary, null, 2));
  process.exitCode = report.summary.status === 'PASS' ? 0 : 1;
}

main().catch(async (error) => {
  for (const service of SERVICES) docker(['start', service.container]);
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
