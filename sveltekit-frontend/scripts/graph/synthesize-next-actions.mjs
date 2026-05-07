#!/usr/bin/env node
/**
 * synthesize-next-actions.mjs
 *
 * Phase 2 of the codebase graph pipeline.
 *
 *   build-codebase-relationships.mjs  →  THIS SCRIPT  →  populated next_actions.md
 *
 * What it adds on top of the relationship extractor:
 *   1. Joins tsgo JSONB diagnostics → diagnostic density per cluster
 *   2. G6 shallow-wiring scan (rg patterns for no-op handlers, unbound $state)
 *   3. Multi-language protocol detection per cluster (grpc, qdrant, neo4j, sse…)
 *   4. Composite cluster risk score [diagnostic × 0.45 + shallow × 0.35 + authority × 0.15]
 *   5. Per-P0/P1 cluster: calls Gemma4 agent (via /api/ai/agent or Ollama direct)
 *   6. Writes populated P0/P1 sections back to next_actions.md
 *   7. Emits synthesis_summary.json for programmatic consumers
 *
 * Usage:
 *   node scripts/graph/synthesize-next-actions.mjs
 *   node scripts/graph/synthesize-next-actions.mjs --run-id=2026-05-07T09-41-43
 *   node scripts/graph/synthesize-next-actions.mjs --dry-run          # print, no writes
 *   node scripts/graph/synthesize-next-actions.mjs --no-llm           # skip Gemma4, keep risk scores
 *   node scripts/graph/synthesize-next-actions.mjs --no-spec-fetch    # skip W3C/MDN fetches
 *
 * npm: "graph:synthesize": "node scripts/graph/synthesize-next-actions.mjs"
 *      "graph:synthesize:dry": "node scripts/graph/synthesize-next-actions.mjs --dry-run --no-llm"
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync }      from 'node:fs';
import { execSync }                     from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath }                from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT        = resolve(__dirname, '../..');
const MEMORY_RUNS = resolve(ROOT, 'memory/runs');
const TSGO_DIAG   = resolve(ROOT, 'scratch/audits/tsgo-diagnostics.json');
const SRC_DIR     = resolve(ROOT, 'src');

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv      = process.argv.slice(2);
const DRY_RUN   = argv.includes('--dry-run');
const NO_LLM    = argv.includes('--no-llm');
const NO_FETCH  = argv.includes('--no-spec-fetch');
const runIdArg  = (() => { const i = argv.findIndex(a => a === '--run-id'); return i >= 0 ? argv[i + 1] : null; })();

// ── Protocol registry ─────────────────────────────────────────────────────────
// Each entry maps a detected language/protocol to its canonical spec URL.
// Used both for spec-fetch hints and to annotate P0/P1 items.

const PROTOCOL_SPECS = {
  grpc: {
    pattern: /grpc\.|GrpcClient|createChannel|\.proto['"]/,
    url:     'https://grpc.io/docs/guides/error/',
    desc:    'gRPC error handling and status codes',
  },
  'sql-drizzle': {
    pattern: /\.from\s*\(\s*\w+\s*\)|\.insert\s*\(|\.update\s*\(|\.select\s*\(/,
    url:     'https://orm.drizzle.team/docs/overview',
    desc:    'Drizzle ORM query patterns',
  },
  'neo4j-cypher': {
    pattern: /neo4j\.run|session\.run|MATCH\s*\(|MERGE\s*\(/,
    url:     'https://neo4j.com/docs/api/javascript-driver/current/',
    desc:    'Neo4j JS driver error handling',
  },
  'qdrant-vector': {
    pattern: /QdrantClient|qdrant\.search|qdrant\.upsert|\.scroll\s*\(/,
    url:     'https://qdrant.tech/documentation/concepts/search/',
    desc:    'Qdrant search & filter API',
  },
  'amqp-rabbitmq': {
    pattern: /channel\.(publish|consume|assertQueue|prefetch)|amqplib/,
    url:     'https://www.rabbitmq.com/docs/consumers#consumer-failures',
    desc:    'RabbitMQ consumer failure handling',
  },
  'sse-streams': {
    pattern: /EventSource|text\/event-stream|sseFormat|ReadableStream/,
    url:     'https://html.spec.whatwg.org/multipage/server-sent-events.html',
    desc:    'W3C SSE — reconnection and error events',
  },
  webgpu: {
    pattern: /GPUDevice|createShaderModule|\.wgsl|navigator\.gpu/,
    url:     'https://gpuweb.github.io/gpuweb/#error-scopes',
    desc:    'WebGPU error scopes and device lost handling',
  },
  'otel-langfuse': {
    pattern: /Langfuse|startSpan|startActiveSpan|tracer\./,
    url:     'https://opentelemetry.io/docs/specs/otel/trace/exceptions/',
    desc:    'OTel exception recording in spans',
  },
  'redis-ioredis': {
    pattern: /getRedis\s*\(\)|ioredis|redis\.get\s*\(|redis\.set\s*\(/,
    url:     'https://github.com/redis/ioredis#error-handling',
    desc:    'ioredis reconnect and error handling',
  },
  'w3c-fetch': {
    pattern: /fetch\s*\(\s*['"`]\/api\//,
    url:     'https://fetch.spec.whatwg.org/#concept-request',
    desc:    'W3C Fetch — network error vs abort',
  },
  'xstate-v5': {
    pattern: /fromPromise|createMachine|useMachine|setup\s*\(\s*\{/,
    url:     'https://stately.ai/docs/migration',
    desc:    'XState v5 migration and actor types',
  },
  'svelte5-runes': {
    pattern: /\$state\s*\(|\$derived\s*\(|\$effect\s*\(|\$props\s*\(/,
    url:     'https://svelte.dev/docs/svelte/what-are-runes',
    desc:    'Svelte 5 runes API',
  },
};

// ── G6 shallow-wiring grep patterns ──────────────────────────────────────────

const SHALLOW_PATTERNS = [
  { name: 'noop_svelte_handler',  pat: 'onclick=\\{\\(\\)\\s*=>\\s*\\{?\\s*\\}' },
  { name: 'noop_ts_callback',     pat: ':\\s*\\(\\)\\s*=>\\s*\\{\\s*\\}' },
  { name: 'never_mutated_state',  pat: 'let \\w+ = \\$state\\(false\\)' },
  { name: 'fetch_missing_await',  pat: '[^=a]fetch\\(\\s*[\'"`]/api/' },
  { name: 'empty_catch',          pat: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}' },
  { name: 'console_log_only',     pat: '=>\\s*\\{\\s*console\\.log\\(' },
];

// ── CLAUDE.md audit gate definitions (Tier A–D) ───────────────────────────────
// expectZero=true: any hit is a failure; expectMinFiles: at least N files must match.
// weight: contribution to cluster risk score (0–1 scale multiplier).

const AUDIT_GATES = [
  // Tier A — Svelte 5 rune compliance (should all return 0 hits)
  { id: 'G21', tier: 'A', desc: 'Svelte4 export let',     expectZero: true,  weight: 0.8,
    pat: 'export\\s+let\\s+\\w+',    extraArgs: '--glob *.svelte' },
  { id: 'G22', tier: 'A', desc: 'Svelte4 $: reactive',    expectZero: true,  weight: 0.8,
    pat: '^\\s*\\$:[^:]',            extraArgs: '--glob *.svelte --multiline' },
  { id: 'G23', tier: 'A', desc: 'Svelte4 on:event=',      expectZero: true,  weight: 0.8,
    pat: '\\bon:[a-z][a-z]+=',       extraArgs: '--glob *.svelte' },
  { id: 'G25', tier: 'A', desc: 'Runes in plain .ts',     expectZero: true,  weight: 0.6,
    pat: '\\$(?:state|derived|effect|props)\\s*[(<]',
    extraArgs: '--type ts --glob !*.svelte.ts --glob !*.d.ts' },
  // Tier B — DB layer health
  { id: 'G11', tier: 'B', desc: 'Wrong DB import (db/index)', expectZero: true, weight: 0.9,
    pat: "from '\\$lib/server/db'", extraArgs: '--type ts' },
  { id: 'G17', tier: 'B', desc: 'Hardcoded localhost in server', expectZero: true, weight: 0.4,
    pat: 'localhost:|127\\.0\\.0\\.1', extraArgs: '--type ts',
    dir: join(SRC_DIR, 'lib', 'server') },
  // Tier C — Auth/validation coverage (flag files with unvalidated POST/no auth)
  { id: 'G18a', tier: 'C', desc: 'API routes missing auth guard', expectZero: true, weight: 0.7,
    pat: 'export.*(?:GET|POST|PUT|PATCH|DELETE).*RequestHandler',
    excludePat: 'locals\\.user|requireAuth|getSession|DEV_BYPASS',
    extraArgs: '--glob +server.ts',
    dir: join(SRC_DIR, 'routes', 'api') },
  { id: 'G19a', tier: 'C', desc: 'POST routes missing Zod validation', expectZero: true, weight: 0.5,
    pat: "export.*POST.*RequestHandler",
    excludePat: 'zod|z\\.string|z\\.object|z\\.array|safeParse|superValidate',
    extraArgs: '--glob +server.ts',
    dir: join(SRC_DIR, 'routes', 'api') },
  // Tier D — Runtime/GPU correctness (should have ≥N files matching)
  { id: 'G27', tier: 'D', desc: 'pytorch-graph ops wired (kmeansWithCentroids)', expectMinFiles: 2, weight: 0.3,
    pat: 'kmeansWithCentroids|trainSOM' },
  { id: 'G40', tier: 'D', desc: 'Glyph prompt cache keys present', expectMinFiles: 1, weight: 0.2,
    pat: 'glyphId|pageIndex|tileIndex|promptCacheKey|setFragment|getFragment' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function rgFiles(pattern, dir = SRC_DIR, extraArgs = '') {
  try {
    const extra = extraArgs ? ` ${extraArgs}` : '';
    const out = execSync(
      `rg --files-with-matches -e "${pattern}"${extra} "${dir}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 },
    );
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Run all CLAUDE.md audit gates; returns { gateResults, fileGates }.
// fileGates: Map<relPath, gateId[]> for per-file cluster risk attribution.
async function runAuditGates() {
  process.stdout.write('[synth] Audit gates (Tier A–D)... ');
  const fileGates   = new Map();   // relPath → gateId[]
  const gateResults = [];

  for (const gate of AUDIT_GATES) {
    const dir = gate.dir ?? SRC_DIR;
    let files = rgFiles(gate.pat, dir, gate.extraArgs ?? '').map(f => toRelative(f));

    // For excludePat gates: remove files that ALSO match the exclude (they have the guard)
    if (gate.excludePat) {
      const excluded = new Set(rgFiles(gate.excludePat, dir, gate.extraArgs ?? '').map(f => toRelative(f)));
      files = files.filter(f => !excluded.has(f));
    }

    let failing = false;
    if (gate.expectZero) {
      // Any hit = failure
      failing = files.length > 0;
    } else if (gate.expectMinFiles !== undefined) {
      // Too few hits = failure (feature not wired)
      failing = files.length < gate.expectMinFiles;
      files = [];  // don't penalise individual files for runtime gates
    }

    if (failing) {
      for (const rel of files) {
        if (!fileGates.has(rel)) fileGates.set(rel, []);
        fileGates.get(rel).push(gate.id);
      }
    }

    gateResults.push({
      id:       gate.id,
      tier:     gate.tier,
      desc:     gate.desc,
      passing:  !failing,
      hitCount: files.length,
      topFiles: files.slice(0, 5),
    });
  }

  const failCount = gateResults.filter(g => !g.passing).length;
  console.log(`${failCount}/${AUDIT_GATES.length} gates failing`);
  return { gateResults, fileGates };
}

function toRelative(absPath) {
  return absPath.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
}

async function safeReadFile(p) {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

async function fetchSpecSummary(url, timeoutMs = 4000) {
  if (NO_FETCH) return null;
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res   = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'deeds-synth/1.0 (codebase error analysis)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500).trim();
  } catch {
    return null;
  }
}

// Call Gemma4 via agent API first, fall back to Ollama direct.
async function callLLM(prompt) {
  if (NO_LLM) return { answer: '_(--no-llm: synthesis skipped)_', toolsUsed: [], rounds: 0 };

  // 1. /api/ai/agent (dev server with full tool-calling)
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 35_000);
    const res   = await fetch('http://localhost:5173/api/ai/agent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body:    JSON.stringify({ query: prompt, pipeline: 'error_analysis' }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const d = await res.json();
      return {
        answer:    d.answer ?? d.result ?? '',
        toolsUsed: d.toolsUsed ?? [],
        rounds:    d.rounds ?? 1,
        backend:   'agent-api',
      };
    }
  } catch { /* fallthrough */ }

  // 2. TurboQuant direct :8090 (GGUF llama-server, KV q8_0, FA on — preferred over raw Ollama)
  const turboPort = process.env.TURBO_PORT ?? '8090';
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    const res   = await fetch(`http://127.0.0.1:${turboPort}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       'gemma4-legal-vlm',
        messages:    [{ role: 'user', content: prompt }],
        stream:      false,
        temperature: 0.3,
        max_tokens:  450,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const d = await res.json();
      const text = d.choices?.[0]?.message?.content ?? '';
      if (text) return { answer: text, toolsUsed: [], rounds: 1, backend: 'turboquant' };
    }
  } catch { /* fallthrough */ }

  // 3. Ollama direct :11434 (final fallback — no KV cache, slower)
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    const res   = await fetch('http://localhost:11434/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:    'gemma4-legal-vlm:latest',
        messages: [{ role: 'user', content: prompt }],
        stream:   false,
        options:  { temperature: 0.3, num_predict: 450 },
      }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const d = await res.json();
      return { answer: d.message?.content ?? '', toolsUsed: [], rounds: 1, backend: 'ollama-direct' };
    }
  } catch { /* fallthrough */ }

  return { answer: '_(synthesis unavailable — start dev server or Ollama)_', toolsUsed: [], rounds: 0, backend: 'none' };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Locate run directory
  const runDirs = (await readdir(MEMORY_RUNS)).sort().reverse();
  const runId   = runIdArg ?? runDirs[0];
  if (!runId) throw new Error(`No runs found in ${MEMORY_RUNS}`);
  const runDir = join(MEMORY_RUNS, runId);
  console.log(`[synth] run: ${runId}`);

  // 2. Load graph artifacts
  const [nodes, synthRaw, relMap] = await Promise.all([
    readFile(join(runDir, 'graph_nodes.json'),         'utf8').then(JSON.parse),
    readFile(join(runDir, 'llm_synthesis_mapping.json'),'utf8').then(JSON.parse),
    readFile(join(runDir, 'relationship_map.json'),    'utf8').then(JSON.parse),
  ]);
  // llm_synthesis_mapping.json shape may vary across graphify versions
  const synthMap = Array.isArray(synthRaw) ? synthRaw
    : (synthRaw.gpuClusterPackets ?? synthRaw.clusters ?? synthRaw.clusterSynthesis ?? synthRaw.clusterPackets ?? []);
  console.log(`[synth] graph: ${nodes.length} nodes, ${synthMap.length} synthesis clusters`);

  // 3. Load tsgo diagnostics (optional — run `npm run audit:tsgo` to generate)
  let diagnostics = [];
  if (existsSync(TSGO_DIAG)) {
    const raw = JSON.parse(await readFile(TSGO_DIAG, 'utf8'));
    diagnostics = raw.diagnostics ?? [];
    console.log(`[synth] tsgo: ${diagnostics.length} diagnostics`);
  } else {
    console.warn(`[synth] tsgo diagnostics not found — run: npm run audit:tsgo`);
    console.warn(`        (continuing without diagnostic density signal)`);
  }

  // 4. Build file→cluster index
  const fileToCluster    = new Map();   // relative path → clusterKey
  const clusterFiles     = new Map();   // clusterKey   → {rel,pageRank,fanIn}[]
  const clusterAuthority = new Map();   // clusterKey   → max graphAuthorityScore
  for (const node of nodes) {
    const rel = toRelative(node.filePath ?? '');
    if (!rel) continue;
    // Support both camelCase (graph_nodes.json) and snake_case field names
    const clusterKey = node.clusterKey ?? node.cluster_key;
    if (!clusterKey) continue;
    fileToCluster.set(rel, clusterKey);
    if (!clusterFiles.has(clusterKey)) clusterFiles.set(clusterKey, []);
    clusterFiles.get(clusterKey).push({ rel, pageRank: node.pageRank ?? 0, fanIn: node.fanIn ?? 0 });
    const nodeAuthority = node.graphAuthorityScore ?? node.graph_authority_score ?? 0;
    if (nodeAuthority > (clusterAuthority.get(clusterKey) ?? 0)) {
      clusterAuthority.set(clusterKey, nodeAuthority);
    }
  }

  // 5. Map diagnostics → cluster
  const clusterDiag = new Map();   // clusterKey → ErrorDiag[]
  for (const d of diagnostics) {
    const rel     = toRelative(d.file_path ?? '');
    const cluster = fileToCluster.get(rel);
    if (!cluster) continue;
    if (!clusterDiag.has(cluster)) clusterDiag.set(cluster, []);
    clusterDiag.get(cluster).push(d);
  }

  // 6. Static audit gates (Tiers B–G)
  process.stdout.write('[synth] Audit gates (G10-G11, G17-G19, G21-G27, G40)... ');

  // ── Tier E: Svelte 5 rune compliance ─────────────────────────────────────────
  const g21Files = rgFiles('export\\s+let\\s+\\w+', SRC_DIR).filter(f => f.endsWith('.svelte'));
  const g22Files = rgFiles('^\\s*\\$:[^:]', SRC_DIR).filter(f => f.endsWith('.svelte'));
  const g23Files = rgFiles('\\bon:[a-z][a-z]+=', SRC_DIR).filter(f => f.endsWith('.svelte'));
  const g25Files = rgFiles('\\$(?:state|derived|effect|props)\\s*[(<]', join(SRC_DIR, 'lib'))
    .filter(f => f.endsWith('.ts') && !f.endsWith('.svelte.ts') && !f.endsWith('.d.ts'))
    .filter(f => {
      // Skip false positives: matches only in comments or string literals
      try {
        const src = readFileSync(f, 'utf8');
        const cleaned = src.split('\n')
          .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
          .map(l => l.replace(/\/\/.*$/, ''))             // strip inline comments
          .join('\n')
          .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")    // strip single-quoted strings
          .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')    // strip double-quoted strings
          .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``');   // strip template literals
        return /\$(?:state|derived|effect|props)\s*[(<]/.test(cleaned);
      } catch { return false; }
    });

  // ── Tier B: DB layer ──────────────────────────────────────────────────────────
  const g11Files = rgFiles('from.*db/index', join(SRC_DIR, 'lib/server'))
    .filter(f => !f.endsWith('.md'));  // exclude AGENTS.md and other markdown

  // ── Tier C: Infrastructure ────────────────────────────────────────────────────
  const g17Files = rgFiles('localhost|127\\.0\\.0\\.1', join(SRC_DIR, 'lib/server'))
    .filter(f => !f.endsWith('env.server.ts') && !f.endsWith('env.server.js')
              && !f.endsWith('.md') && !f.endsWith('.env') && !basename(f).startsWith('.env'));

  // ── Tier D: Security ──────────────────────────────────────────────────────────
  const routesApiDir = join(SRC_DIR, 'routes/api');
  const g18Files = existsSync(routesApiDir)
    ? rgFiles('^export\\s+(async\\s+)?function\\s+(GET|POST|PUT|DELETE|PATCH)', routesApiDir)
        .filter(f => rgFiles('locals\\.user|requireAuth|getSession', dirname(f)).length === 0)
    : [];
  const g19Files = existsSync(routesApiDir)
    ? rgFiles('^export\\s+(async\\s+)?function\\s+(POST|PUT|PATCH)', routesApiDir)
        .filter(f => rgFiles('import.*zod|z\\.object|zodSchema|safeParse', dirname(f)).length === 0)
    : [];

  // ── Tier F: GPU/pytorch-graph wiring ──────────────────────────────────────────
  const g27Kmeans = rgFiles('kmeansWithCentroids', join(SRC_DIR, 'lib/server'));
  const g27Som    = rgFiles('trainSOM',            join(SRC_DIR, 'lib/server'));
  const g27Pass   = g27Kmeans.length >= 1 && g27Som.length >= 1;

  // ── Tier G: Glyph prompt cache alignment ─────────────────────────────────────
  const g40Files  = rgFiles('glyphId|pageIndex|promptCacheKey|setFragment|getFragment', join(SRC_DIR, 'lib/server'));
  const g40Pass   = g40Files.length >= 1;

  const auditGateSummary = {
    g11_wrong_db_client:     g11Files.length,   // must be 0
    g17_localhost_hardcoded: g17Files.length,
    g18_missing_auth:        g18Files.length,
    g19_missing_zod:         g19Files.length,
    g21_svelte4_props:       g21Files.length,
    g22_svelte4_reactive:    g22Files.length,
    g23_svelte4_events:      g23Files.length,
    g25_runes_in_plain_ts:   g25Files.length,
    g27_pass:                g27Pass,
    g27_kmeans_consumers:    g27Kmeans.length,
    g27_som_consumers:       g27Som.length,
    g40_glyph_cache_pass:    g40Pass,
  };

  const auditFailures = [
    ...(g11Files.length ? g11Files.map(f => ({ gate: 'G11', file: toRelative(f), msg: 'imports from db/index (should use db/client)' })) : []),
    ...(g17Files.length ? g17Files.map(f => ({ gate: 'G17', file: toRelative(f), msg: 'hardcoded localhost outside env.server.ts' })) : []),
    ...(g18Files.length ? g18Files.map(f => ({ gate: 'G18', file: toRelative(f), msg: 'API route missing auth guard' })) : []),
    ...(g21Files.length ? g21Files.map(f => ({ gate: 'G21', file: toRelative(f), msg: 'export let (Svelte 4 props)' })) : []),
    ...(g22Files.length ? g22Files.map(f => ({ gate: 'G22', file: toRelative(f), msg: '$: reactive (Svelte 4)' })) : []),
    ...(g23Files.length ? g23Files.map(f => ({ gate: 'G23', file: toRelative(f), msg: 'on:event directive (Svelte 4)' })) : []),
    ...(g25Files.length ? g25Files.map(f => ({ gate: 'G25', file: toRelative(f), msg: '$state/$derived in plain .ts' })) : []),
    ...(!g27Pass ? [{ gate: 'G27', file: 'lib/server/', msg: `pytorch-graph: kmeansWithCentroids=${g27Kmeans.length} trainSOM=${g27Som.length} (need ≥1 each)` }] : []),
    ...(!g40Pass ? [{ gate: 'G40', file: 'lib/server/', msg: 'glyph prompt cache (glyphId/pageIndex/promptCacheKey) not wired' }] : []),
  ];

  const auditGateFiles = new Set([
    ...g11Files, ...g17Files, ...g18Files, ...g19Files,
    ...g21Files, ...g22Files, ...g23Files, ...g25Files,
  ].map(toRelative));

  // G6 shallow-wiring scan
  const shallowFiles = new Set();
  const shallowHitsByFile = new Map();   // relative path → pattern names[]
  for (const { name, pat } of SHALLOW_PATTERNS) {
    for (const abs of rgFiles(pat)) {
      const rel = toRelative(abs);
      shallowFiles.add(rel);
      if (!shallowHitsByFile.has(rel)) shallowHitsByFile.set(rel, []);
      shallowHitsByFile.get(rel).push(name);
    }
  }
  const clusterShallow = new Map();  // clusterKey → string[]
  for (const rel of shallowFiles) {
    const cluster = fileToCluster.get(rel);
    if (!cluster) continue;
    if (!clusterShallow.has(cluster)) clusterShallow.set(cluster, []);
    clusterShallow.get(cluster).push(rel);
  }
  const totalFlagged = shallowFiles.size + auditGateFiles.size;
  console.log(`${shallowFiles.size} shallow + ${auditGateFiles.size} gate violations (${totalFlagged} total)`);
  if (Object.values(auditGateSummary).some(v => v > 0)) {
    console.log(`  G21=${auditGateSummary.g21_svelte4_props} G22=${auditGateSummary.g22_svelte4_reactive} G23=${auditGateSummary.g23_svelte4_events} G25=${auditGateSummary.g25_runes_in_plain_ts} G17=${auditGateSummary.g17_localhost_hardcoded} G18=${auditGateSummary.g18_missing_auth} G19=${auditGateSummary.g19_missing_zod}`);
  }

  // 7. Protocol detection (sample first 15 files per cluster)
  process.stdout.write('[synth] Protocol detection... ');
  const clusterProtocols = new Map();  // clusterKey → Set<string>
  for (const [clusterKey, fileEntries] of clusterFiles) {
    const protocols = new Set();
    for (const { rel } of fileEntries.slice(0, 15)) {
      const abs = join(SRC_DIR, rel.replace(/^src\//, ''));
      const src = await safeReadFile(abs);
      if (!src) continue;
      for (const [proto, { pattern }] of Object.entries(PROTOCOL_SPECS)) {
        if (pattern.test(src)) protocols.add(proto);
      }
    }
    if (protocols.size) clusterProtocols.set(clusterKey, protocols);
  }
  console.log('done');

  // 8. Spec fetch for P0 protocols (one per unique protocol, cached)
  const specCache = new Map();  // protocol → summary string | null
  async function getSpecSummary(proto) {
    if (specCache.has(proto)) return specCache.get(proto);
    const spec = PROTOCOL_SPECS[proto];
    if (!spec) return null;
    const summary = await fetchSpecSummary(spec.url);
    specCache.set(proto, summary);
    return summary;
  }

  // 9. Risk scoring
  const maxDiag    = Math.max(1, ...clusterDiag.values().map   ? [...clusterDiag.values()].map(v => v.length) : [1]);
  const maxShallow = Math.max(1, ...clusterShallow.values().map ? [...clusterShallow.values()].map(v => v.length) : [1]);

  const scored = synthMap.map(cluster => {
    const files       = clusterFiles.get(cluster.cluster_key) ?? [];
    const diagList    = clusterDiag.get(cluster.cluster_key)    ?? [];
    const shallowList = clusterShallow.get(cluster.cluster_key) ?? [];
    const protocols   = [...(clusterProtocols.get(cluster.cluster_key) ?? [])];
    // Authority: prefer aggregated max from nodes (graphAuthorityScore), fall back to synthMap field
    const authority   = clusterAuthority.get(cluster.cluster_key ?? cluster.clusterKey)
                        ?? cluster.graph_authority_score ?? cluster.graphAuthorityScore ?? 0;

    // Gate violations in this cluster
    const gateViolations = [...files].filter(({ rel }) => auditGateFiles.has(rel)).length;
    const maxGate = Math.max(1, auditGateFiles.size / Math.max(1, clusterFiles.size) * 3);

    // Normalized 0–1 signals
    const diagDensity    = diagList.length    / Math.max(1, maxDiag);
    const shallowDensity = shallowList.length / Math.max(1, maxShallow);
    const gateDensity    = gateViolations     / maxGate;
    // High authority clusters have higher blast radius → small positive bonus
    const authorityBoost = authority > 0.6 ? 0.12 : authority > 0.3 ? 0.06 : 0;

    const risk = Math.min(1,
      diagDensity    * 0.40 +
      shallowDensity * 0.30 +
      gateDensity    * 0.15 +
      authorityBoost
    );

    return {
      ...cluster,
      fileCount:    files.length,
      diagList,
      shallowList,
      protocols,
      risk,
      // Top files by pageRank for context
      topFiles: [...files].sort((a, b) => b.pageRank - a.pageRank).slice(0, 5).map(f => f.rel),
    };
  }).sort((a, b) => b.risk - a.risk);

  const p0 = scored.filter(c => c.risk > 0.45).slice(0, 3);
  const p1 = scored.filter(c => c.risk > 0.20 && c.risk <= 0.45).slice(0, 5);
  console.log(`[synth] P0: ${p0.length} clusters  P1: ${p1.length} clusters`);

  // 10. Gemma4 synthesis per cluster
  async function synthesize(cluster, priority) {
    const topErrors = cluster.diagList.slice(0, 6)
      .map(d => `  ${toRelative(d.file_path)}:${d.line} — ${d.message} [${d.code}]`)
      .join('\n');

    const specHints = (await Promise.all(
      cluster.protocols.slice(0, 4).map(async p => {
        const spec    = PROTOCOL_SPECS[p];
        const summary = await getSpecSummary(p);
        return spec ? `- ${spec.desc} (${spec.url})${summary ? ': ' + summary.slice(0, 120) : ''}` : null;
      })
    )).filter(Boolean).join('\n');

    const prompt = `You are a TypeScript/SvelteKit code-quality analyst reviewing cluster risk data.

Cluster: ${cluster.cluster_key}
Priority: ${priority}
Risk score: ${cluster.risk.toFixed(3)} (diagnostic×0.45 + shallow-wiring×0.35 + authority-boost)
Files: ${cluster.fileCount}   Diagnostics: ${cluster.diagList.length}   Shallow-wiring hits: ${cluster.shallowList.length}
Graph authority: ${(cluster.graph_authority_score ?? 0).toFixed(3)}
Protocols detected: ${cluster.protocols.join(', ') || 'none'}
Top files (by pageRank):
${cluster.topFiles.map(f => '  ' + f).join('\n') || '  (none)'}

${cluster.diagList.length ? `Top TypeScript diagnostics:\n${topErrors}` : ''}

${cluster.shallowList.length ? `Files with shallow-wiring patterns:\n${cluster.shallowList.slice(0, 4).map(f => '  ' + f).join('\n')}` : ''}

Synthesis hint: ${cluster.synthesis_prompt_hint ?? ''}

${specHints ? `Relevant specs:\n${specHints}` : ''}

In 3–4 sentences: what is the most likely root-cause pattern driving the risk score in this cluster, and what single focused change would resolve the most issues? Name specific files and patterns.`.trim();

    process.stdout.write(`[synth] ${priority} ${cluster.cluster_key}... `);
    const result = await callLLM(prompt);
    console.log(`done (${result.backend ?? 'unknown'}, ${result.rounds} round(s))`);
    return result;
  }

  const p0Results = [];
  for (const c of p0) p0Results.push({ cluster: c, synthesis: await synthesize(c, 'P0') });

  const p1Results = [];
  for (const c of p1) p1Results.push({ cluster: c, synthesis: await synthesize(c, 'P1') });

  // 11. Render markdown blocks
  function renderCluster(result, priority) {
    const { cluster: c, synthesis: s } = result;
    const badge   = priority === 'P0' ? '🔴' : '🟡';
    const specLinks = c.protocols
      .map(p => PROTOCOL_SPECS[p])
      .filter(Boolean)
      .map(sp => `[${sp.desc}](${sp.url})`)
      .join(' · ');

    const lines = [
      `### ${badge} ${c.cluster_key} — risk \`${c.risk.toFixed(3)}\``,
      '',
      `**Files**: ${c.fileCount}  ·  **Diagnostics**: ${c.diagList.length}  ·  **Shallow wiring**: ${c.shallowList.length}  ·  **Authority**: ${(c.graph_authority_score ?? 0).toFixed(3)}`,
    ];
    if (c.protocols.length) lines.push(`**Protocols**: \`${c.protocols.join('`  `')}\``);
    if (specLinks) lines.push(`**Specs**: ${specLinks}`);
    lines.push('');
    const via = s.toolsUsed?.length ? ` via \`${s.toolsUsed.join('`, `')}\`` : '';
    lines.push(`**Analysis**${via}:`);
    lines.push(s.answer || '_(no answer)_');
    lines.push('');
    if (c.topFiles.length) {
      lines.push(`**Top files**: \`${c.topFiles.slice(0, 3).join('`  `')}\``);
    }
    return lines.join('\n');
  }

  const p0Md = p0Results.length
    ? p0Results.map(r => renderCluster(r, 'P0')).join('\n\n')
    : '_No P0 clusters detected — cluster-level error density is low._';

  const p1Md = p1Results.length
    ? p1Results.map(r => renderCluster(r, 'P1')).join('\n\n')
    : '_No P1 clusters detected._';

  // 12. Patch next_actions.md
  const mdPath  = join(runDir, 'next_actions.md');
  let mdContent = await readFile(mdPath, 'utf8');

  // Replace P0 block
  mdContent = mdContent.replace(
    /(## P0 — Critical[^\n]*\n)([\s\S]*?)(?=\n## P1)/,
    `$1\n${p0Md}\n`,
  );
  // Replace P1 block
  mdContent = mdContent.replace(
    /(## P1 — Important \(improves ACE quality\)\n)([\s\S]*?)(?=\n## Relationship|\n---)/,
    `$1\n${p1Md}\n`,
  );

  // Synthesis metadata footer
  const metaBlock = [
    '',
    '## Synthesis Metadata',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Run ID | \`${runId}\` |`,
    `| Synthesized at | ${new Date().toISOString()} |`,
    `| tsgo diagnostics loaded | ${diagnostics.length} |`,
    `| Shallow-wired files | ${shallowFiles.size} |`,
    `| P0 clusters | ${p0.length} |`,
    `| P1 clusters | ${p1.length} |`,
    `| LLM backend | ${NO_LLM ? 'none (--no-llm)' : (p0Results[0]?.synthesis.backend ?? 'gemma4/bifrost')} |`,
    `| Spec fetch | ${NO_FETCH ? 'disabled' : 'enabled'} |`,
    '',
  ].join('\n');

  if (mdContent.includes('## Synthesis Metadata')) {
    mdContent = mdContent.replace(/\n## Synthesis Metadata[\s\S]*$/, metaBlock);
  } else {
    mdContent += metaBlock;
  }

  // 13. Write outputs
  if (DRY_RUN) {
    console.log('\n[synth] DRY RUN — first 3000 chars of output:\n');
    console.log(mdContent.slice(0, 3000));
    console.log('\n...(truncated)');
  } else {
    await writeFile(mdPath, mdContent, 'utf8');
    console.log(`[synth] wrote: ${mdPath}`);

    // audit_gates.json — machine-readable gate pass/fail state
    await writeFile(join(runDir, 'audit_gates.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      runId,
      gates: auditGateSummary,
      allPass: auditFailures.length === 0,
    }, null, 2), 'utf8');
    console.log(`[synth] wrote: ${join(runDir, 'audit_gates.json')}`);

    // audit_failures.json — actionable failure list for downstream tooling
    await writeFile(join(runDir, 'audit_failures.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      runId,
      failureCount: auditFailures.length,
      failures: auditFailures,
    }, null, 2), 'utf8');
    console.log(`[synth] wrote: ${join(runDir, 'audit_failures.json')} (${auditFailures.length} failures)`);

    const summaryPath = join(runDir, 'synthesis_summary.json');
    await writeFile(summaryPath, JSON.stringify({
      runId,
      synthesizedAt: new Date().toISOString(),
      tsgoDiagnostics: diagnostics.length,
      shallowWiredFiles: shallowFiles.size,
      auditGates: auditGateSummary,
      totalFiles: relMap.totalFiles ?? nodes.length,
      totalEdges: relMap.totalEdges ?? 0,
      p0: p0Results.map(r => ({
        cluster:  r.cluster.cluster_key,
        risk:     r.cluster.risk,
        diagCount: r.cluster.diagList.length,
        shallowCount: r.cluster.shallowList.length,
        protocols: r.cluster.protocols,
        topFiles: r.cluster.topFiles,
      })),
      p1: p1Results.map(r => ({
        cluster:  r.cluster.cluster_key,
        risk:     r.cluster.risk,
        diagCount: r.cluster.diagList.length,
        shallowCount: r.cluster.shallowList.length,
        protocols: r.cluster.protocols,
        topFiles: r.cluster.topFiles,
      })),
    }, null, 2), 'utf8');
    console.log(`[synth] wrote: ${summaryPath}`);
  }
}

main().catch(err => {
  console.error('[synth] fatal:', err.message);
  process.exit(1);
});
