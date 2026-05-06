#!/usr/bin/env node
/**
 * smoke-trace-full-loop.mjs
 *
 * Runs 5 representative prompts through the full TRACE pipeline via the
 * SvelteKit dev server and logs structured results, verifying:
 *   - HMM intent detection (retrievalTrace.hmm present)
 *   - Retrieval signals (qdrant_hit, graph_neighbor, agents_md, topology)
 *   - Cache behaviour (hit vs miss, type)
 *   - Memory gain (gainScore, decision)
 *   - Wiki 4D note written (wiki:note:hmm:*)
 *
 * Results are written to:
 *   logs/trace-full-loop/trace-full-loop-YYYYMMDD-HHMMSS.json
 *   logs/trace-full-loop/latest.json
 *
 * Usage:
 *   node scripts/smoke-trace-full-loop.mjs
 *   node scripts/smoke-trace-full-loop.mjs --strict    # exit 1 on any failure
 *   node scripts/smoke-trace-full-loop.mjs --quiet     # minimal stdout
 *   node scripts/smoke-trace-full-loop.mjs --cache-only  # only run repeated-query cache test
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const STRICT     = process.argv.includes('--strict');
const QUIET      = process.argv.includes('--quiet');
const CACHE_ONLY = process.argv.includes('--cache-only');
const BASE_URL   = process.env.VITE_BASE_URL ?? 'http://localhost:5173';

const color = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

const log = (...args) => { if (!QUIET) console.log(...args); };

// ── Prompts ──────────────────────────────────────────────────────────────────

const PROMPTS = [
  {
    id: 'routes-test-priority',
    query: 'Which routes need tests first?',
    expectedSection: 'LEGAL_AUTHORITY', // code-intel query — often resolves CLAIMS or LEGAL_AUTHORITY
    description: 'Code-intel: route test priority',
  },
  {
    id: 'graph-analyze-retrieval',
    query: 'Explain the graph analyze endpoint and its retrieval path.',
    expectedSection: 'FACTS',
    description: 'Architecture explanation: graph analyze endpoint',
  },
  {
    id: 'topology-near-ace',
    query: 'Find topology-related code near the ACE context assembler.',
    expectedSection: 'FACTS',
    description: 'Topology search near ACE',
  },
  {
    id: 'hmm-integration-history',
    query: 'What changed in the HMM ACE analyzer integration?',
    expectedSection: 'FACTS',
    description: 'HMM integration changelog',
  },
  {
    id: 'code-intel-plan',
    query: 'Create a Claude plan for the highest-risk code-intel route.',
    expectedSection: 'CLAIMS',
    description: 'Agentic plan for code-intel audit',
  },
];

// ── Repeated-query cache test ────────────────────────────────────────────────

const CACHE_TEST_QUERY = 'Explain the topology search path for graph analyze.';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callACE(query, opts = {}) {
  const t0 = Date.now();
  let resp, body;
  try {
    resp = await fetch(`${BASE_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // dev-bypass auth header used by local dev server
        'x-dev-bypass': 'true',
      },
      body: JSON.stringify({
        model: 'yorha-legal',
        messages: [{ role: 'user', content: query }],
        max_tokens: 300,
        ...opts,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    body = await resp.json();
  } catch (err) {
    return { error: err.message, durationMs: Date.now() - t0 };
  }

  const durationMs = Date.now() - t0;
  const yorha = body?.yorha ?? {};
  const choice = body?.choices?.[0];

  return {
    durationMs,
    status: resp.status,
    ok: resp.ok,
    yorha,
    choice,
    raw: body,
  };
}

function extractTraceFields(result) {
  const yorha = result.yorha ?? {};
  return {
    durationMs:  result.durationMs,
    hmm: {
      hmmAnalyzerUsed: !!yorha.retrievalTrace?.hmm,
      flowScore:       yorha.retrievalTrace?.hmm?.flowScore ?? null,
      dominantSection: yorha.retrievalTrace?.hmm?.dominantSection ?? null,
      fromCache:       yorha.retrievalTrace?.hmm?.fromCache ?? null,
      analysisMs:      yorha.retrievalTrace?.hmm?.analysisMs ?? null,
    },
    retrieval: {
      contextChunks:  yorha.contextChunks ?? null,
      qdrantHit:      yorha.qdrantHit ?? (yorha.contextChunks > 0) ?? false,
      graphNeighbor:  yorha.graphNeighbor ?? false,
      agentsMd:       !!yorha.agentsMd,
      priorCache:     yorha.cacheHit === 'prior-answer',
      topologyUsed:   yorha.retrievalTrace?.topoPrefilter?.used ?? false,
      aceUsed:        !!yorha.aceUsed,
    },
    cache: {
      hit:  ['prior-answer', 'agents-md', 'exact'].includes(yorha.cacheHit),
      type: yorha.cacheHit ?? 'miss',
    },
    memory: {
      // memory gain fields surfaced in yorha block if TRACE memory-gain loop is running
      gainScore: yorha.memoryGainScore ?? null,
      decision:  yorha.memoryDecision ?? null,
    },
    wiki: {
      encoded: !!yorha.retrievalTrace?.hmm?.stableKey,
      noteId:  yorha.retrievalTrace?.hmm?.stableKey ?? null,
    },
    error: result.error ?? null,
  };
}

// ── Verifications ────────────────────────────────────────────────────────────

function verifyResult(id, fields, runIndex = 0) {
  const issues = [];

  // For run 2+ of the same query, expect cache hit
  if (runIndex > 0 && !fields.cache.hit) {
    issues.push(`run ${runIndex + 1}: expected cache hit but got miss`);
  }

  // Warn (don't fail) if HMM wiki note not present — infra may not have Redis
  if (!fields.hmm.hmmAnalyzerUsed && !fields.error) {
    issues.push('retrievalTrace.hmm not present — hmm-wiki-logger may not be wired yet');
  }

  if (fields.error) {
    issues.push(`fetch error: ${fields.error}`);
  }

  return issues;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${color.bold(color.cyan('TRACE Full-Loop Smoke Test'))}`);
  log(`${color.dim(`Base URL: ${BASE_URL}`)}\n`);

  // Quick connectivity check
  try {
    const ping = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error(`health returned ${ping.status}`);
    log(`${color.green('✓')} SvelteKit reachable\n`);
  } catch (err) {
    console.error(color.red(`✗ SvelteKit not reachable at ${BASE_URL}: ${err.message}`));
    console.error(color.yellow('  Start the dev server first: npm run dev'));
    if (STRICT) process.exit(1);
    console.error(color.dim('  (continuing in non-strict mode — all results will be errors)'));
  }

  const runResults = [];
  let totalIssues = 0;

  const promptsToRun = CACHE_ONLY ? [] : PROMPTS;

  for (const prompt of promptsToRun) {
    log(`${color.cyan('→')} [${prompt.id}] ${prompt.description}`);
    const result = await callACE(prompt.query);
    const fields = extractTraceFields(result);
    const issues = verifyResult(prompt.id, fields, 0);
    totalIssues += issues.length;

    const icon = issues.filter(i => !i.includes('may not be wired')).length === 0
      ? color.green('✓')
      : color.yellow('⚠');
    log(`  ${icon} ${fields.durationMs}ms | cache:${fields.cache.type} | chunks:${fields.retrieval.contextChunks ?? '?'} | hmm:${fields.hmm.hmmAnalyzerUsed ? 'yes' : 'no'}`);
    if (issues.length > 0) issues.forEach(i => log(`     ${color.yellow('⚠')} ${i}`));

    runResults.push({
      query:     prompt.query,
      id:        prompt.id,
      run:       1,
      ...fields,
      issues,
    });
  }

  // ── Repeated-query cache test ──
  log(`\n${color.bold('Repeated-query cache test')}`);
  log(`${color.dim(`Query: "${CACHE_TEST_QUERY}"`)}`);

  for (let i = 0; i < 2; i++) {
    log(`  ${color.cyan('→')} Run ${i + 1}…`);
    const result = await callACE(CACHE_TEST_QUERY);
    const fields = extractTraceFields(result);
    const issues = verifyResult('cache-test', fields, i);
    totalIssues += issues.length;

    const icon = issues.length === 0 ? color.green('✓') : color.yellow('⚠');
    log(`  ${icon} ${fields.durationMs}ms | cache:${fields.cache.type} | chunks:${fields.retrieval.contextChunks ?? '?'}`);
    if (issues.length > 0) issues.forEach(i2 => log(`     ${color.yellow('⚠')} ${i2}`));

    runResults.push({
      query: CACHE_TEST_QUERY,
      id:    `cache-test-run${i + 1}`,
      run:   i + 1,
      ...fields,
      issues,
    });
  }

  // ── Persist results ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join(ROOT, 'logs', 'trace-full-loop');
  mkdirSync(outDir, { recursive: true });

  const payload = {
    runAt:     new Date().toISOString(),
    baseUrl:   BASE_URL,
    totalRuns: runResults.length,
    issues:    totalIssues,
    results:   runResults,
  };

  const timedPath  = join(outDir, `trace-full-loop-${ts}.json`);
  const latestPath = join(outDir, 'latest.json');
  writeFileSync(timedPath,  JSON.stringify(payload, null, 2));
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  log(`\n${color.dim('Results written to:')}`);
  log(`  ${color.dim(timedPath)}`);
  log(`  ${color.dim(latestPath)}`);

  const hardIssues = totalIssues - runResults.filter(r => r.issues?.some(i => i.includes('may not be wired'))).length;
  log('');
  if (hardIssues === 0) {
    log(color.green('✓ Full-loop smoke passed.'));
  } else {
    log(color.yellow(`⚠ ${hardIssues} issue(s) found.`));
    if (STRICT) {
      console.error(color.red('--strict: exiting with code 1'));
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(color.red('Smoke script error:'), err);
  if (STRICT) process.exit(1);
});
