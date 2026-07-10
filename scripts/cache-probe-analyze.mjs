#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[key] = argv[i + 1];
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function summarizeRows(rows) {
  const byLayer = groupBy(rows, (row) => row.layer ?? 'unknown');
  const layers = [];

  for (const [layer, items] of byLayer.entries()) {
    const successRows = items.filter((r) => r.success);
    const totalMs = successRows.map((r) => Number(r.total_ms)).filter(Number.isFinite);
    const lookupMs = successRows.map((r) => Number(r.lookup_ms)).filter(Number.isFinite);
    const promptEvalMs = successRows.map((r) => Number(r.prompt_eval_ms)).filter(Number.isFinite);
    const cacheHits = items.filter((r) => r.cache_hit === true).length;
    const cacheMisses = items.filter((r) => r.cache_hit === false).length;

    layers.push({
      layer,
      rows: items.length,
      success: successRows.length,
      failures: items.length - successRows.length,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      total_ms: {
        p50: percentile(totalMs, 0.5),
        p95: percentile(totalMs, 0.95),
        p99: percentile(totalMs, 0.99),
      },
      lookup_ms: {
        p50: percentile(lookupMs, 0.5),
        p95: percentile(lookupMs, 0.95),
        p99: percentile(lookupMs, 0.99),
      },
      prompt_eval_ms: {
        p50: percentile(promptEvalMs, 0.5),
        p95: percentile(promptEvalMs, 0.95),
        p99: percentile(promptEvalMs, 0.99),
      },
    });
  }

  const cases = groupBy(rows, (row) => row.case_id?.split('-')[0] ?? 'unknown');
  const caseSummaries = [];
  for (const [caseId, items] of cases.entries()) {
    const direct = items.filter((r) => r.layer === 'llama.cpp_direct' && r.success);
    const adapter = items.filter((r) => r.layer === 'opencode_adapter' && r.success);
    const exact = items.filter((r) => r.layer === 'bitfrost_exact');
    const semantic = items.filter((r) => r.layer === 'bitfrost_semantic');

    caseSummaries.push({
      case_id: caseId,
      rows: items.length,
      direct_prompt_eval_ms: percentile(direct.map((r) => Number(r.prompt_eval_ms)).filter(Number.isFinite), 0.5),
      adapter_prompt_eval_ms: percentile(adapter.map((r) => Number(r.prompt_eval_ms)).filter(Number.isFinite), 0.5),
      exact_hit_rate: exact.length ? exact.filter((r) => r.cache_hit === true).length / exact.length : null,
      semantic_hit_rate: semantic.length ? semantic.filter((r) => r.cache_hit === true).length / semantic.length : null,
    });
  }

  return { layers, cases: caseSummaries };
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS cache_probe_runs (
      run_id UUID PRIMARY KEY,
      context_hash VARCHAR(64) NOT NULL,
      context_chars INT NOT NULL,
      iterations INT NOT NULL,
      source_file TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cache_probe_results (
      id BIGSERIAL PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES cache_probe_runs(run_id) ON DELETE CASCADE,
      case_id VARCHAR(32) NOT NULL,
      iteration INT NOT NULL,
      layer VARCHAR(64) NOT NULL,
      success BOOLEAN NOT NULL DEFAULT false,
      total_ms INT,
      prompt_tokens INT,
      completion_tokens INT,
      prompt_eval_tokens INT,
      prompt_eval_ms INT,
      generation_ms INT,
      ttft_ms INT,
      reused_prefix_tokens INT,
      slot_id INT,
      lookup_ms INT,
      cache_hit BOOLEAN,
      inferred_cache_hit BOOLEAN,
      reason TEXT,
      error TEXT,
      context_hash VARCHAR(64) NOT NULL,
      execution_order INT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cache_probe_runs_created_at ON cache_probe_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cache_probe_results_run ON cache_probe_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_cache_probe_results_case ON cache_probe_results(case_id);
    CREATE INDEX IF NOT EXISTS idx_cache_probe_results_layer ON cache_probe_results(layer);
  `);
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function maybeInsertRows(results, meta, dryRun) {
  if (dryRun) return { inserted: 0 };

  const dbUrl =
    process.env.CACHE_PROBE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `
      INSERT INTO cache_probe_runs (run_id, context_hash, context_chars, iterations, source_file)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (run_id) DO UPDATE SET
        context_hash = EXCLUDED.context_hash,
        context_chars = EXCLUDED.context_chars,
        iterations = EXCLUDED.iterations,
        source_file = EXCLUDED.source_file
    `,
      [meta.runId, meta.contextHash, meta.contextChars, meta.iterations, meta.sourceFile],
    );

    for (const row of results) {
      await client.query(
        `
        INSERT INTO cache_probe_results (
          run_id, case_id, iteration, layer, success, total_ms, prompt_tokens, completion_tokens,
          prompt_eval_tokens, prompt_eval_ms, generation_ms, ttft_ms, reused_prefix_tokens, slot_id,
          lookup_ms, cache_hit, inferred_cache_hit, reason, error, context_hash, execution_order, timestamp
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22
        )
      `,
        [
          meta.runId,
          row.case_id ?? null,
          toInt(String(row.case_id ?? '').split('-').slice(-1)[0]),
          row.layer ?? null,
          Boolean(row.success),
          toInt(row.total_ms),
          toInt(row.prompt_tokens),
          toInt(row.completion_tokens),
          toInt(row.prompt_eval_tokens),
          toInt(row.prompt_eval_ms),
          toInt(row.generation_ms),
          toInt(row.ttft_ms),
          toInt(row.reused_prefix_tokens),
          toInt(row.slot_id),
          toInt(row.lookup_ms),
          row.cache_hit === true ? true : row.cache_hit === false ? false : null,
          row.inferred_cache_hit === true ? true : row.inferred_cache_hit === false ? false : null,
          row.reason ?? null,
          row.error ?? null,
          row.context_hash ?? meta.contextHash,
          toInt(row.execution_order),
          row.timestamp ?? new Date().toISOString(),
        ],
      );
    }
    return { inserted: results.length };
  } finally {
    await client.end();
  }
}

function renderReport(summary, meta, insertedCount) {
  const lines = [];
  lines.push('# Cache Probe Analysis');
  lines.push('');
  lines.push(`- Run ID: \`${meta.runId}\``);
  lines.push(`- Context hash: \`${meta.contextHash}\``);
  lines.push(`- Context chars: ${meta.contextChars}`);
  lines.push(`- Iterations: ${meta.iterations}`);
  lines.push(`- Rows analyzed: ${summary.layers.reduce((acc, layer) => acc + layer.rows, 0)}`);
  lines.push(`- Rows written to Postgres: ${insertedCount}`);
  lines.push('');
  lines.push('## Layer Summary');
  lines.push('');
  lines.push('| Layer | Rows | Success | Failures | Cache hits | Cache misses | p50 total ms | p95 total ms | p99 total ms |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const layer of summary.layers) {
    lines.push(
      `| ${layer.layer} | ${layer.rows} | ${layer.success} | ${layer.failures} | ${layer.cache_hits} | ${layer.cache_misses} | ${fmt(layer.total_ms.p50)} | ${fmt(layer.total_ms.p95)} | ${fmt(layer.total_ms.p99)} |`,
    );
  }
  lines.push('');
  lines.push('## Case Summary');
  lines.push('');
  lines.push('| Case | Rows | Direct prompt_eval ms | Adapter prompt_eval ms | Exact hit rate | Semantic hit rate |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const c of summary.cases) {
    lines.push(
      `| ${c.case_id} | ${c.rows} | ${fmt(c.direct_prompt_eval_ms)} | ${fmt(c.adapter_prompt_eval_ms)} | ${pct(c.exact_hit_rate)} | ${pct(c.semantic_hit_rate)} |`,
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Treat prompt-eval timing as the primary cache signal.');
  lines.push('- Keep warm-up and measured runs separated when interpreting the report.');
  lines.push('- Ten samples are enough for directional validation, not for strong p99 claims.');
  lines.push('- Exact and semantic caches should be evaluated independently.');
  return lines.join('\n');
}

function fmt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return `${Math.round(Number(value))}`;
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return `${Math.round(Number(value) * 100)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(root, args.input ?? 'reports/cache-probe-results.json');
  const output = path.resolve(root, args.output ?? 'reports/cache-probe-analysis.md');
  const dryRun = Boolean(args['dry-run'] || args.dryRun);
  const writeDb = Boolean(args['write-db'] || args.writeDb);
  const runId = String(args['run-id'] ?? args.runId ?? '');

  if (!fs.existsSync(input)) {
    throw new Error(`Input not found: ${input}`);
  }

  const parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
  const results = Array.isArray(parsed) ? parsed : parsed.results ?? [];
  const meta = {
    runId: runId || parsed.run_id || parsed.runId || randomUUID(),
    contextHash: parsed.context_hash || parsed.contextHash || 'unknown',
    contextChars: parsed.context_chars || parsed.contextChars || 0,
    iterations: parsed.iterations || parsed.meta?.iterations || 0,
    sourceFile: path.relative(root, input).replaceAll('\\', '/'),
  };

  const summary = summarizeRows(results);
  const report = renderReport(summary, meta, 0);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, report + '\n', 'utf8');

  let inserted = 0;
  if (writeDb) {
    const insertResult = await maybeInsertRows(results, meta, dryRun);
    inserted = insertResult.inserted;
  }

  console.log(JSON.stringify({ input, output, rows: results.length, runId: meta.runId, inserted, dryRun, writeDb }, null, 2));
}

await main();
