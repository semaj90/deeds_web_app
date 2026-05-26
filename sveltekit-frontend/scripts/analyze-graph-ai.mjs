#!/usr/bin/env node
/**
 * analyze-graph-ai.mjs
 *
 * Extends analyze-graph.mjs with Gemma4 (TurboQuant :8090) analysis.
 * Reads the same JSON outputs but adds LLM-generated recommendations for:
 *   - Top error clusters → root cause + fix plan
 *   - Auth gap clusters → specific fix pattern
 *   - High-fan-in files → refactor strategy
 *   - Production blockers → prioritized action list
 *
 * Requires: TurboQuant running on :8090  (npm run turbo:start:detached)
 *
 * Usage:
 *   node scripts/analyze-graph-ai.mjs
 *   node scripts/analyze-graph-ai.mjs --turbo-base http://localhost:8090
 *   node scripts/analyze-graph-ai.mjs --no-write    # console only
 *   node scripts/analyze-graph-ai.mjs --top 5       # analyse top N clusters
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const TOP       = parseInt(process.argv.find(a => a.startsWith('--top='))?.split('=')[1] ?? '5', 10);
const NO_WRITE  = process.argv.includes('--no-write');
const TURBO_BASE = process.argv.find(a => a.startsWith('--turbo-base='))?.split('=')[1]
  ?? process.env.GEMMA_BASE
  ?? 'http://localhost:8090';

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ── Load graph outputs ────────────────────────────────────────────────────

const graphPath    = path.join(ROOT, 'docs/graph/codebase-graph.json');
const clustersPath = path.join(ROOT, 'docs/graph/hypergraph-clusters.json');
const errorsPath   = path.join(ROOT, 'logs/phase78-errors.json');

if (!existsSync(graphPath)) {
  console.error(c.red(`Missing ${graphPath} — run: npm run graphify:daily`));
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const files = graph.files ?? [];
const gateStats = graph.gateStats ?? {};
const cyclicPairs = graph.audit?.cyclicPairs ?? [];
const topFanIn    = graph.audit?.topFanIn ?? [];

const clusters = existsSync(clustersPath)
  ? JSON.parse(readFileSync(clustersPath, 'utf8'))
  : null;

const errors = existsSync(errorsPath)
  ? (() => { try { return JSON.parse(readFileSync(errorsPath, 'utf8')); } catch { return []; } })()
  : [];

console.log(c.bold('\n=== Graphify × Gemma4 Analysis ===\n'));
console.log(c.dim(`Files: ${files.length} | Clusters: ${clusters?.clusters?.length ?? 0} | Errors: ${errors.length}`));
console.log(c.dim(`TurboQuant: ${TURBO_BASE}`));
console.log();

// ── Gemma4 call ───────────────────────────────────────────────────────────

async function askGemma4(systemPrompt, userPrompt, maxTokens = 512) {
  const res = await fetch(`${TURBO_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-rotorquant:latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TurboQuant ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    text:   data.choices?.[0]?.message?.content ?? '',
    tokens: data.usage?.total_tokens ?? 0,
  };
}

// ── Check TurboQuant availability ─────────────────────────────────────────

let turboAvailable = false;
try {
  const health = await fetch(`${TURBO_BASE}/health`, { signal: AbortSignal.timeout(3000) });
  turboAvailable = health.ok;
} catch {
  turboAvailable = false;
}

if (!turboAvailable) {
  console.error(c.red('❌ TurboQuant not reachable on ' + TURBO_BASE));
  console.error(c.dim('   Start it with the "🚀 Start TurboQuant" VS Code task, then retry.'));
  process.exit(1);
}
console.log(c.green('✓ TurboQuant reachable\n'));

// ── Build context blobs ───────────────────────────────────────────────────

const SYSTEM = `You are a senior TypeScript/SvelteKit architect reviewing a legal-AI application codebase.
The app uses: SvelteKit 2, Drizzle ORM, Postgres, Redis, Qdrant (vector DB), Ollama (local LLM),
LibTorch N-API GPU bridge (k-means, PageRank, cosine), WebGPU (browser), and a 4D hypergraph topology layer.
Your job: provide concise, actionable recommendations. No preamble. Use numbered lists.`;

const gateBlob = `Gate stats:
- Auth gaps: ${gateStats.routesWithoutAuth ?? 0} routes missing guards
- Zod gaps:  ${gateStats.routesWithoutZod ?? 0} routes missing input validation
- Test gaps: ${gateStats.routesWithoutTest ?? 0} routes missing tests
- SSR-unsafe: ${gateStats.ssrUnsafeCount ?? 0} components with browser globals
- Cyclic deps: ${gateStats.cyclicPairCount ?? 0} cyclic pairs
- Rune-in-.ts: ${gateStats.runeInTsCount ?? 0} files with Svelte runes in plain .ts`;

const topClusters = (clusters?.clusters ?? [])
  .slice(0, TOP)
  .map(cl => `  Cluster #${cl.id}: size=${cl.size}, topic="${cl.inferredTopic ?? 'unknown'}", top-dir="${cl.topDirectory ?? '?'}"`)
  .join('\n');

const topErrors = errors
  .slice(0, 15)
  .map(e => `  ${e.file ?? e.path ?? '?'}:${e.line ?? '?'} — ${(e.message ?? '').slice(0, 80)}`)
  .join('\n');

const topCycles = cyclicPairs
  .slice(0, 5)
  .map(p => `  ${p.a ?? p[0]} ↔ ${p.b ?? p[1]}`)
  .join('\n');

const topFan = topFanIn
  .slice(0, 5)
  .map(f => `  fan-in=${f.fanIn} → ${f.rel}`)
  .join('\n');

// ── Run Gemma4 analysis passes ─────────────────────────────────────────────

const results = {};
let totalTokens = 0;

async function runPass(key, label, userPrompt, maxTokens = 512) {
  process.stdout.write(`  ${c.cyan('→')} ${label}... `);
  try {
    const { text, tokens } = await askGemma4(SYSTEM, userPrompt, maxTokens);
    results[key] = text;
    totalTokens += tokens;
    console.log(c.green(`✓`) + c.dim(` (${tokens} tokens)`));
    return text;
  } catch (err) {
    console.log(c.red('✗') + c.dim(` ${err.message}`));
    results[key] = `_Gemma4 analysis failed: ${err.message}_`;
    return null;
  }
}

console.log(c.bold('Running Gemma4 analysis passes...\n'));

await runPass('prodBlockers', 'Production blockers', `
${gateBlob}

Top cyclic dependency pairs:
${topCycles || '  none'}

Top fan-in files (highest blast radius):
${topFan || '  none'}

List the top 5 production blockers in priority order.
For each: what breaks in prod, how to fix it (1 sentence), which file/pattern to change.
`, 600);

await runPass('errorRootCause', 'Error root-cause analysis', `
TypeScript errors from the last compile run (${errors.length} total):
${topErrors || '  (no error log found — run npm run phase78:collect-errors first)'}

${gateBlob}

For each error group, identify:
1. Root cause (1 sentence)
2. Pattern to fix (code change or tsconfig adjustment)
3. Risk if left unfixed

Keep each entry to 3 lines.
`, 700);

if (clusters) {
  await runPass('clusterRec', 'Cluster architecture recommendations', `
${gateBlob}

Top ${TOP} hypergraph clusters (by size, from k-means on 768-dim Qdrant embeddings):
${topClusters}

For each cluster:
1. What does this cluster represent architecturally?
2. What is the highest-risk pattern in that area?
3. One concrete improvement (rename, extract, delete, guard, test).
`, 800);
}

await runPass('ff1Plan', 'FF1 compute routing plan', `
This codebase has:
- LibTorch N-API GPU bridge: cosine similarity, k-means, PageRank, SOM BMU lookup
- simdjson N-API: fast JSON parse with LRU cache
- WASM SIMD fallback (browser + server)
- Redis cache layer (sub-ms hits)
- TypeScript 7 (tsgo) just installed for faster type-checking

Hot paths currently (from fan-in analysis):
${topFan || '  embedding, cache, auth'}

Recommend:
1. Which 3 hot paths need FF1 compute routing most urgently?
2. For each: what tier (GPU/WASM/JS/Cache) and why?
3. What would change in production latency?
`, 500);

// ── Build markdown ─────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const timestamp = new Date().toISOString();
const outDir  = path.join(ROOT, '..', 'next_steps', 'active');
const outPath = path.join(outDir, `${today}-graph-analysis-ai.md`);

const md = [
  `# Graphify × Gemma4 Analysis — ${today}`,
  '',
  `> Generated ${timestamp} by \`scripts/analyze-graph-ai.mjs\``,
  `> TurboQuant: ${TURBO_BASE} | Total tokens: ${totalTokens.toLocaleString()}`,
  '',
  '## Static gate summary',
  '',
  '| Check | Count |',
  '|-------|-------|',
  `| Auth gaps | ${gateStats.routesWithoutAuth ?? 0} |`,
  `| Zod gaps | ${gateStats.routesWithoutZod ?? 0} |`,
  `| Test gaps | ${gateStats.routesWithoutTest ?? 0} |`,
  `| SSR-unsafe | ${gateStats.ssrUnsafeCount ?? 0} |`,
  `| Cyclic deps | ${gateStats.cyclicPairCount ?? 0} |`,
  `| Rune-in-.ts | ${gateStats.runeInTsCount ?? 0} |`,
  '',
  '## Gemma4: Production blockers',
  '',
  results.prodBlockers ?? '_Not run_',
  '',
  '## Gemma4: Error root-cause analysis',
  '',
  results.errorRootCause ?? '_Not run_',
  '',
  ...(clusters ? [
    '## Gemma4: Cluster architecture recommendations',
    '',
    results.clusterRec ?? '_Not run_',
    '',
  ] : []),
  '## Gemma4: FF1 compute routing plan',
  '',
  results.ff1Plan ?? '_Not run_',
  '',
  '## How to re-run',
  '',
  '```bash',
  '# Refresh graph data then re-analyse:',
  'npm run graphify:daily && node scripts/analyze-graph-ai.mjs',
  '',
  '# Full pipeline (30 min):',
  'npm run graphify:full && node scripts/analyze-graph-ai.mjs',
  '```',
  '',
].join('\n');

if (NO_WRITE) {
  console.log('\n' + md.slice(0, 2000) + '\n...(--no-write)');
} else {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  const rel = path.relative(path.resolve(ROOT, '..'), outPath).replace(/\\/g, '/');
  console.log(`\n${c.green('✓')} Wrote ${c.cyan(rel)} (${md.length.toLocaleString()} chars)`);
}

console.log(c.dim(`\nTotal Gemma4 tokens used: ${totalTokens.toLocaleString()}`));
