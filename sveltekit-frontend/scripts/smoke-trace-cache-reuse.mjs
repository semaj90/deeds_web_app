#!/usr/bin/env node
/**
 * smoke-trace-cache-reuse.mjs
 *
 * Proves cache reuse: runs the same query twice through /api/v1/chat/completions
 * and checks that Run 1 shows real retrieval activity and Run 2 gets a cache hit.
 *
 * Run 1: cold call — topology/graph/Qdrant retrieval + synthesis → answer stored
 * Run 2: warm call — should hit code-llm-index (cacheHit: 'prior-answer')
 *
 * Validation (signal-based):
 *   Run 1 pass: topologyUsed || graphNeighbor || qdrantHit
 *   Run 2 pass: cache.hit || retrieval.priorCache || hmm.signals?.includes('prior_cache')
 *
 * Output:
 *   logs/trace-full-loop/cache-reuse-latest.json
 *
 * Usage:
 *   node scripts/smoke-trace-cache-reuse.mjs
 *   TRACE_STRICT=1 node scripts/smoke-trace-cache-reuse.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const STRICT   = process.argv.includes('--strict') || process.env.TRACE_STRICT === '1';
const BASE_URL = process.env.PUBLIC_APP_URL ?? process.env.ACE_FULL_LOOP_URL ?? process.env.VITE_BASE_URL ?? 'http://localhost:5173';
const ENDPOINT = `${BASE_URL}/api/v1/chat/completions`;
const QUERY    = 'Explain the topology search path for graph analyze.';

const color = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

async function callACE(query) {
  const t0 = Date.now();
  let resp, body;
  try {
    resp = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        model:      'yorha-legal',
        messages:   [{ role: 'user', content: query }],
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    body = await resp.json();
  } catch (err) {
    return { error: err.message, durationMs: Date.now() - t0 };
  }
  return { durationMs: Date.now() - t0, status: resp.status, ok: resp.ok, body };
}

function normalise(run, result) {
  const body  = result.body ?? {};
  const yorha = body.yorha  ?? {};
  // Read HMM from top-level retrievalTrace (wired by linter), fall back to yorha block
  const hmm   = body.retrievalTrace?.hmm ?? yorha.hmm ?? null;
  const cache = yorha.cacheHit ?? 'none';

  // Signal-based retrieval fields
  const topologyUsed  = !!(body.retrievalTrace?.topoPrefilter?.used ?? yorha.topoPrefilter?.used);
  const graphNeighbor = !!(body.retrievalTrace?.graphAuthority      ?? yorha.graphAuthority);
  const qdrantHit     = (yorha.contextChunks ?? 0) > 0;
  const priorCache    = cache === 'prior-answer';

  const warnings = [];
  if (result.error) warnings.push(`fetch_error:${result.error}`);

  // Run 1: prove retrieval was attempted
  if (run === 1 && !topologyUsed && !graphNeighbor && !qdrantHit) {
    warnings.push('run1_no_retrieval_signal: topologyUsed=false graphNeighbor=false qdrantHit=false');
  }

  // Run 2: prove cache reuse (any signal counts)
  const run2CacheHit = cache !== 'none';
  const run2Signal   = run2CacheHit || priorCache || !!(hmm?.signals?.includes('prior_cache'));
  if (run === 2 && !run2Signal) {
    warnings.push(`run2_no_cache_signal: cacheHit=${cache} — prior-answer may not be stored yet`);
  }

  return {
    run,
    query: QUERY,
    durationMs:  result.durationMs,
    status:      result.status ?? null,
    cache: {
      hit:  cache !== 'none',
      type: cache,
    },
    hmm: {
      hmmAnalyzerUsed: !!hmm?.hmmAnalyzerUsed,
      intent:          hmm?.intent     ?? null,
      confidence:      hmm?.confidence ?? null,
      signals:         hmm?.signals    ?? null,
    },
    retrieval: {
      contextChunks: yorha.contextChunks ?? null,
      agentsMd:      !!yorha.agentsMd,
      aceUsed:       !!yorha.aceUsed,
      topologyUsed,
      graphNeighbor,
      qdrantHit,
      priorCache,
    },
    rawShape: {
      hasRetrievalTrace: 'retrievalTrace' in body,
      hasYorha:          'yorha' in body,
      hasHmm:            !!hmm?.hmmAnalyzerUsed,
    },
    warnings,
    error: result.error ?? null,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`\n${color.bold(color.cyan('TRACE Cache-Reuse Smoke'))}`);
  console.log(`${color.dim(`Query: "${QUERY}"`)}`);
  console.log(`${color.dim(`Endpoint: ${ENDPOINT}`)}\n`);

  // Connectivity
  try {
    const ping = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!ping.ok) throw new Error(`health ${ping.status}`);
    console.log(`${color.green('✓')} SvelteKit reachable\n`);
  } catch (err) {
    console.error(color.red(`✗ Not reachable: ${err.message}`));
    if (STRICT) {
      process.exitCode = 1;
      return;
    }
  }

  const runs = [];
  for (let i = 1; i <= 2; i++) {
    console.log(`${color.cyan('→')} Run ${i}…`);
    const raw    = await callACE(QUERY);
    const fields = normalise(i, raw);
    runs.push(fields);
    const icon = fields.warnings.length === 0 ? color.green('✓') : color.yellow('⚠');
    console.log(`  ${icon} ${fields.durationMs}ms | cache:${fields.cache.type} | hmm:${fields.hmm.intent ?? 'no'} | chunks:${fields.retrieval.contextChunks ?? '?'}`);
    if (fields.warnings.length) fields.warnings.forEach(w => console.log(`     ${color.yellow('⚠')} ${w}`));
  }

  // Compare
  const run1 = runs[0];
  const run2 = runs[1];
  const run1Retrieved = run1.retrieval.topologyUsed || run1.retrieval.graphNeighbor || run1.retrieval.qdrantHit;
  const run2CacheHit  = run2.cache.hit || run2.retrieval.priorCache || !!(run2.hmm.signals?.includes('prior_cache'));
  const hmmConsistent = run1.hmm.intent === run2.hmm.intent;

  console.log(`\n${color.bold('Comparison')}`);
  console.log(`  run 1 retrieved: ${run1Retrieved ? color.green('yes') : color.yellow('no (cold retrieval had no signals)')}`);
  console.log(`  run 2 cache hit: ${run2CacheHit  ? color.green('yes') : color.yellow('no (will reuse on next warm call if server persists)')}`);
  console.log(`  hmm consistent:  ${hmmConsistent ? color.green('yes') : color.yellow(`run1=${run1.hmm.intent} run2=${run2.hmm.intent}`)}`);

  const finishedAt   = new Date().toISOString();
  const warningCount = runs.reduce((s, r) => s + r.warnings.length, 0);
  const errorCount   = runs.filter(r => r.error).length;

  const outDir = join(ROOT, 'logs', 'trace-full-loop');
  mkdirSync(outDir, { recursive: true });

  const payload = {
    kind:          'trace-cache-reuse-smoke',
    schemaVersion: 2,
    summary: {
      startedAt,
      finishedAt,
      query:        QUERY,
      run1Retrieved,
      run2CacheHit,
      hmmConsistent,
      warningCount,
      errorCount,
    },
    runs,
  };

  const outPath = join(outDir, 'cache-reuse-latest.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n${color.dim(`Written: ${outPath}`)}`);

  if (errorCount > 0) {
    console.log(color.red(`✗ ${errorCount} error(s)`));
    if (STRICT) process.exitCode = 1;
  } else if (warningCount > 0) {
    console.log(color.yellow(`⚠ ${warningCount} warning(s) — cache reuse may need a warm server`));
    if (STRICT) {
      console.error(color.red('TRACE_STRICT=1: exitCode 1 on warnings'));
      process.exitCode = 1;
    }
  } else {
    console.log(color.green('✓ Cache-reuse smoke passed.'));
  }
}

main().catch(err => {
  console.error(color.red('Smoke error:'), err);
  process.exitCode = 1;
});
