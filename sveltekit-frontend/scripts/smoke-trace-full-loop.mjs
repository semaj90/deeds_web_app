#!/usr/bin/env node
/**
 * smoke-trace-full-loop.mjs
 *
 * Durable proof artifact: proves the system uses ACE/HMM/Karpathy memory,
 * not merely indexes it. Runs 5 representative prompts through the full
 * TRACE pipeline via /api/v1/chat/completions (OpenAI facade → ACE/KAG/RAG
 * → Gemma4 synthesis → HMM classification → cache).
 *
 * Validates the REAL implementation shape (from openai-types.ts):
 *   body.retrievalTrace: { hmm: AceHmmMeta, topoPrefilter?, graphAuthority? }
 *   body.yorha:          { aceUsed, contextChunks, agentsMd, codeLlmHit, cacheHit, durationMs, hmm }
 *
 * Warning codes (machine-readable):
 *   missing_retrieval_trace    — body.retrievalTrace absent
 *   hmm_analyzer_not_used      — hmmAnalyzerUsed !== true
 *   missing_hmm_intent         — intent null / 'unknown'
 *   missing_hmm_confidence     — confidence not a number
 *   missing_hmm_state          — state null / 'unknown'
 *   missing_hmm_signals        — signals empty or absent
 *   missing_memory_gain_score  — memory.gainScore not wired yet (aspirational)
 *   missing_memory_decision    — memory.decision not wired yet (aspirational)
 *
 * Output:
 *   logs/trace-full-loop/trace-full-loop-YYYYMMDD-HHMMSS.json
 *   logs/trace-full-loop/latest.json
 *
 * Usage:
 *   node scripts/smoke-trace-full-loop.mjs
 *   node scripts/smoke-trace-full-loop.mjs --strict       # exitCode 1 on warnings
 *   TRACE_STRICT=1 node scripts/smoke-trace-full-loop.mjs
 *   node scripts/smoke-trace-full-loop.mjs --quiet
 *   ACE_FULL_LOOP_URL=http://... node ...                  # override base URL
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const STRICT   = process.argv.includes('--strict') || process.env.TRACE_STRICT === '1';
const QUIET    = process.argv.includes('--quiet');
const BASE_URL = process.env.PUBLIC_APP_URL ?? process.env.ACE_FULL_LOOP_URL ?? process.env.VITE_BASE_URL ?? 'http://localhost:5173';
const ENDPOINT = `${BASE_URL}/api/v1/chat/completions`;

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
    id:          'routes-test-priority',
    query:       'Which routes need tests first?',
    description: 'Code-intel: route test priority',
    filePath:    'src/routes/api/hypergraph/traverse/+server.ts',
  },
  {
    id:          'graph-analyze-retrieval',
    query:       'Explain the graph analyze endpoint and its retrieval path.',
    description: 'Architecture explanation: graph analyze endpoint',
    filePath:    'src/routes/api/graph/analyze/+server.ts',
  },
  {
    id:          'topology-near-ace',
    query:       'Find topology-related code near the ACE context assembler.',
    description: 'Topology search near ACE',
    filePath:    'src/lib/server/ace/context-assembler.ts',
  },
  {
    id:          'hmm-integration-history',
    query:       'What changed in the HMM ACE analyzer integration?',
    description: 'HMM integration history',
    filePath:    'src/lib/server/analysis/hmm-ace-analyzer.ts',
  },
  {
    id:          'code-intel-plan',
    query:       'Create a plan for auditing the highest-risk API routes.',
    description: 'Agentic plan for code-intel audit',
  },
];

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function callACE(prompt) {
  const t0 = Date.now();
  let resp, body;
  try {
    resp = await fetch(ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-bypass':  'true',
      },
      body: JSON.stringify({
        model:      'yorha-legal',
        messages:   [{ role: 'user', content: prompt.query }],
        max_tokens: 300,
        ...(prompt.filePath && { file_path: prompt.filePath }),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    body = await resp.json();
  } catch (err) {
    return { error: err.message, durationMs: Date.now() - t0, raw: null };
  }
  return { durationMs: Date.now() - t0, status: resp.status, ok: resp.ok, body };
}

// ── Machine-readable validation ───────────────────────────────────────────────
//
// Source of truth: openai-types.ts AceHmmMeta + RetrievalTrace + OpenAIChatCompletionResponse
// Only validates fields that openai-facade.ts wrapResponse() actually fills.

function validateResult(result) {
  const warnings = [];
  if (!result.rawShape?.hasRetrievalTrace)    warnings.push('missing_retrieval_trace');
  if (!result.hmm?.hmmAnalyzerUsed)           warnings.push('hmm_analyzer_not_used');
  if (!result.hmm?.intent || result.hmm.intent === 'unknown') warnings.push('missing_hmm_intent');
  if (typeof result.hmm?.confidence !== 'number')             warnings.push('missing_hmm_confidence');
  if (!result.hmm?.state || result.hmm.state === 'unknown')   warnings.push('missing_hmm_state');
  if (!Array.isArray(result.hmm?.signals) || result.hmm.signals.length === 0) warnings.push('missing_hmm_signals');
  if (typeof result.memory?.gainScore !== 'number') warnings.push('missing_memory_gain_score');
  if (!result.memory?.decision || result.memory.decision === 'unknown') warnings.push('missing_memory_decision');
  return warnings;
}

// ── Normalise ─────────────────────────────────────────────────────────────────

function normalise(prompt, result) {
  const body  = result.body ?? {};
  const yorha = body.yorha  ?? {};
  // Read HMM from top-level retrievalTrace (wired by linter), fall back to yorha block
  const hmm   = body.retrievalTrace?.hmm ?? yorha.hmm ?? null;

  const errors = [];

  if (result.error) {
    errors.push(`fetch_error:${result.error}`);
  } else if (!result.ok) {
    errors.push(`http_${result.status}`);
  } else {
    if (!Array.isArray(body.choices) || !body.choices[0]?.message?.content) {
      errors.push('missing_choices_content');
    }
    if (!('yorha' in body)) {
      errors.push('missing_yorha_block');
    }
  }

  const cacheHit = yorha.cacheHit ?? 'none';

  const record = {
    id:          prompt.id,
    query:       prompt.query,
    filePath:    prompt.filePath ?? null,
    durationMs:  result.durationMs,
    status:      result.status ?? null,
    hmm: {
      hmmAnalyzerUsed: hmm?.hmmAnalyzerUsed ?? false,
      intent:          hmm?.intent          ?? null,
      confidence:      hmm?.confidence      ?? null,
      state:           hmm?.state           ?? null,
      signals:         hmm?.signals         ?? null,
    },
    retrieval: {
      aceUsed:       !!yorha.aceUsed,
      contextChunks: yorha.contextChunks ?? null,
      agentsMd:      !!yorha.agentsMd,
      codeLlmHit:    !!yorha.codeLlmHit,
    },
    cache: {
      hit:  cacheHit !== 'none',
      type: cacheHit,
    },
    // Aspirational — not yet wired in facade; surfaces null so latent wiring is visible
    memory: {
      gainScore: null,
      decision:  null,
    },
    rawShape: {
      hasRetrievalTrace: 'retrievalTrace' in body,
      hasYorha:          'yorha' in body,
    },
    retrievalTrace:  body.retrievalTrace ?? null,
    errors,
    warnings:        [],
    contentPreview:  body.choices?.[0]?.message?.content?.slice(0, 80) ?? null,
  };

  // Machine-readable validation only runs when the envelope itself is valid
  if (errors.length === 0) {
    record.warnings = validateResult(record);
    // Extra contextual check — not in spec validateResult
    if (prompt.filePath && yorha.agentsMd === false) {
      record.warnings.push('agents_md_miss_with_filepath');
    }
  }

  return record;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  log(`\n${color.bold(color.cyan('TRACE Full-Loop Smoke'))}`);
  log(`${color.dim(`Endpoint: ${ENDPOINT}`)}\n`);

  // Connectivity check
  try {
    const ping = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(4_000) });
    if (!ping.ok) throw new Error(`health returned ${ping.status}`);
    log(`${color.green('✓')} SvelteKit reachable\n`);
  } catch (err) {
    console.error(color.red(`✗ SvelteKit unreachable at ${BASE_URL}: ${err.message}`));
    console.error(color.yellow('  Start the dev server: npm run dev'));
    if (STRICT) {
      process.exitCode = 1;
      return;
    }
    console.error(color.dim('  (non-strict — continuing with fetch errors)'));
  }

  const results = [];

  for (const prompt of PROMPTS) {
    log(`${color.cyan('→')} [${prompt.id}] ${prompt.description}`);
    const raw    = await callACE(prompt);
    const record = normalise(prompt, raw);
    results.push(record);

    const icon = record.errors.length > 0 ? color.red('✗')
               : record.warnings.length > 0 ? color.yellow('⚠')
               : color.green('✓');

    const hmmStr    = record.hmm.hmmAnalyzerUsed ? (record.hmm.intent ?? 'present') : 'missing';
    const cacheStr  = record.cache.type;
    const chunksStr = record.retrieval.contextChunks ?? '?';
    log(`  ${icon} ${record.durationMs}ms | hmm:${hmmStr} | cache:${cacheStr} | chunks:${chunksStr}`);

    for (const e of record.errors)   log(`     ${color.red('✗')} ${e}`);
    for (const w of record.warnings) log(`     ${color.yellow('⚠')} ${w}`);
  }

  // Persist
  const finishedAt   = new Date().toISOString();
  const errorCount   = results.reduce((s, r) => s + r.errors.length, 0);
  const warningCount = results.reduce((s, r) => s + r.warnings.length, 0);
  const passCount    = results.filter(r => r.errors.length === 0 && r.warnings.length === 0).length;

  const outDir = join(ROOT, 'logs', 'trace-full-loop');
  mkdirSync(outDir, { recursive: true });

  const payload = {
    kind:          'trace-full-loop-smoke',
    schemaVersion: 2,
    summary: {
      startedAt,
      finishedAt,
      endpoint:     ENDPOINT,
      promptCount:  PROMPTS.length,
      passCount,
      warningCount,
      errorCount,
    },
    results,
  };

  const ts         = startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const timedPath  = join(outDir, `trace-full-loop-${ts}.json`);
  const latestPath = join(outDir, 'latest.json');
  writeFileSync(timedPath,  JSON.stringify(payload, null, 2));
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  log(`\n${color.dim('Written:')} ${color.dim(latestPath)}`);

  const summary = `${passCount}/${PROMPTS.length} pass | ${warningCount} warn | ${errorCount} err`;
  if (errorCount > 0) {
    log(color.red(`✗ ${summary}`));
    if (STRICT) process.exitCode = 1;
  } else if (warningCount > 0) {
    log(color.yellow(`⚠ ${summary}`));
    if (STRICT) {
      console.error(color.red('--strict / TRACE_STRICT=1: exitCode 1 on warnings'));
      process.exitCode = 1;
    }
  } else {
    log(color.green(`✓ ${summary}`));
  }
}

main().catch(err => {
  console.error(color.red('Smoke error:'), err);
  process.exitCode = 1;
});
