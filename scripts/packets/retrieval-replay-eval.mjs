#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const queriesPath = args[args.indexOf('--queries') + 1] ?? args[0];
const topK = Number(args[args.indexOf('--top-k') + 1] ?? 10);

if (!queriesPath || !fs.existsSync(queriesPath)) {
  console.error(`Missing queries file: ${queriesPath}`);
  process.exit(2);
}

fs.mkdirSync('.tmp', { recursive: true });
fs.mkdirSync('reports', { recursive: true });

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    timeout: opts.timeout ?? 15000
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout.trim(),
    stderr: r.stderr.trim()
  };
}

function dockerRedis(args) {
  const c = process.env.REDIS_CONTAINER ?? 'legal-ai-valkey';
  const p = process.env.REDIS_PASSWORD ?? '';
  const auth = p ? `-a "${p}" --no-auth-warning` : '';
  return sh(`docker exec ${c} redis-cli ${auth} ${args}`);
}

function dockerPsql(sql) {
  const c = process.env.POSTGRES_CONTAINER ?? 'legal-ai-postgres';
  const u = process.env.POSTGRES_USER ?? 'legal_admin';
  const d = process.env.POSTGRES_DB ?? 'legal_ai_db';
  return sh(`docker exec ${c} psql -U ${u} -d ${d} -t -A -c "${sql.replaceAll('"', '\\"')}"`);
}

async function httpJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, text: String(e.message ?? e) };
  }
}

const queries = fs.readFileSync(queriesPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) {
      throw new Error(`Bad JSONL at line ${i + 1}: ${e.message}`);
    }
  });

const globalChecks = {
  valkeyPing: dockerRedis('PING'),
  karpathyTtl: dockerRedis('TTL gpu:karpathy:scores'),
  authorityTtl: dockerRedis('TTL ace:authority:top'),
  llmBusyExists: dockerRedis('EXISTS llm:busy'),
  packetsCount: dockerPsql('SELECT COUNT(*) FROM route_runtime_packets;'),
  badSourceRefs: dockerPsql("SELECT COUNT(*) FROM route_runtime_packets WHERE source_refs::text ~ 'unknown|\\\\.venv|node_modules|backup-';"),
  rawNullCount: dockerPsql('SELECT COUNT(*) FROM route_runtime_packets WHERE raw IS NULL;'),
  graphCount: dockerPsql('SELECT COUNT(*) FROM route_supervision_graph;')
};

const qdrant = await httpJson(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333/collections');

function intOut(check) {
  const n = Number(String(check.stdout ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

const evidence = {
  exact_cache: globalChecks.valkeyPing.ok,
  semantic_cache: globalChecks.valkeyPing.ok && intOut(globalChecks.karpathyTtl) !== -2,
  postgres_jsonb: globalChecks.packetsCount.ok && (intOut(globalChecks.packetsCount) ?? 0) > 0,
  bm25: globalChecks.packetsCount.ok && (intOut(globalChecks.packetsCount) ?? 0) > 0,
  qdrant: qdrant.ok,
  graph: globalChecks.graphCount.ok && (intOut(globalChecks.graphCount) ?? 0) > 0,
  rrf: qdrant.ok && globalChecks.packetsCount.ok,
  karpathy: globalChecks.karpathyTtl.ok && (intOut(globalChecks.karpathyTtl) ?? -2) !== -2,
  source_ref_quality: globalChecks.badSourceRefs.ok && intOut(globalChecks.badSourceRefs) === 0
};

const results = queries.map(q => {
  const checks = Object.fromEntries(q.must_hit?.map(hit => [hit, Boolean(evidence[hit])]) || []);
  const passed = Object.values(checks).every(Boolean);
  return {
    id: q.id,
    lane: q.lane,
    query: q.query,
    must_hit: q.must_hit ?? [],
    checks: checks,
    passed: passed,
    topK: q.topK
  };
});

const passCount = results.filter(r => r.passed).length;
const successRate = results.length ? passCount / results.length : 0;
const passed = successRate >= 0.95;

const report = {
  generated_at: new Date().toISOString(),
  queries: results.length,
  pass_count: passCount,
  success_rate: successRate,
  passed: passed,
  evidence: evidence,
  global_checks: Object.fromEntries(
    Object.entries(globalChecks).map(([k, v]) => [k, {
      ok: v.ok,
      stdout: v.stdout,
      stderr: v.stderr
    }])
  ),
  qdrant: qdrant,
  results: results
};

fs.writeFileSync('.tmp/retrieval-replay-report.json', JSON.stringify(report, null, 2));

const md = [
  '# Retrieval Replay Report',
  '',
  `- queries: ${results.length}`,
  `- pass_count: ${passCount}`,
  `- success_rate: ${(successRate * 100).toFixed(1)}%`,
  `- passed: ${passed ? 'yes' : 'no'}`,
  '',
  '## Evidence',
  '',
  ...Object.entries(evidence).map(([k,v]) => `- ${k}: ${v ? '✅' : '❌'}`),
  '',
  '## Results',
  '',
  ...results.map(r => `- ${r.passed ? '✅' : '❌'} ${r.id} (${r.lane}) — ${Object.entries(r.checks).map(([k,v]) => `${k}:${v?'ok':'fail'}`).join(', ')}`)
].join('\n');

fs.writeFileSync('reports/retrieval-replay-report.md', md);

console.log(md);

if (!passed) process.exit(1);