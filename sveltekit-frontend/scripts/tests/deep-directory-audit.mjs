#!/usr/bin/env node
/**
 * deep-directory-audit.mjs
 *
 * Deep directory analysis using:
 *   1. rg (ripgrep) for fast structural metrics per directory
 *   2. ACE chunk retrieval — pulls Qdrant semantic summaries per directory
 *   3. 4D topology / hyperedge community context from Redis
 *   4. Gemma4 agent summarization per directory cluster
 *
 * Writes a timestamped plan to next_steps/active/ with per-directory
 * consolidation recommendations, production-readiness scores, and
 * distilled RAG context for each directory.
 *
 * Usage:
 *   node scripts/tests/deep-directory-audit.mjs [target] [options]
 *
 * Arguments:
 *   target              Directory to audit relative to src/ (default: "lib/server")
 *                       Examples: lib/server  lib  routes/api  lib/server/ai
 *
 * Options:
 *   --depth N           Max directory depth for grouping (default: 2)
 *   --min-files N       Only audit dirs with ≥N files (default: 1)
 *   --no-rag            Skip ACE/Qdrant semantic retrieval
 *   --no-graph          Skip 4D hyperedge topology lookup
 *   --no-agent          Skip Gemma4 agent summarization pass
 *   --dry-run           Print plan to stdout, skip writing file
 *   --turbo             Route Gemma4 inference through TurboQuant :8090
 *   --require-inference Abort if no LLM backend is reachable
 *   --limit N           Max directories to audit in detail (default: 30)
 *   --write-map         After audit, regenerate docs/CODEBASE_DIRECTORY_MAP.md
 */

import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import path           from 'path';
import { fileURLToPath } from 'url';
import { ensureInference, inferenceMarkdownTable } from './ensure-inference.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '../..');    // sveltekit-frontend/
const SRC        = path.join(ROOT, 'src');
const PLANS_DIR  = path.join(ROOT, 'next_steps', 'active');

const DEV_SERVER = process.env.DEV_SERVER_URL  ?? 'http://localhost:5173';
const QDRANT_URL = process.env.QDRANT_URL      ?? 'http://localhost:6333';
const REDIS_URL  = process.env.REDIS_URL       ?? 'redis://localhost:6379';
const TURBO_URL  = process.env.TURBO_URL       ?? 'http://localhost:8090';
const BYPASS     = { 'x-dev-bypass-auth': 'true' };

const args       = process.argv.slice(2);
const TARGET_ARG = args.find(a => !a.startsWith('--')) ?? 'lib/server';
function getArg(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const v = parseInt(args[i + 1]);
  return isNaN(v) ? def : v;
}
const DEPTH             = getArg('--depth', 2);
const MIN_FILES         = getArg('--min-files', 1);
const LIMIT             = getArg('--limit', 30);
const NO_RAG            = args.includes('--no-rag');
const NO_GRAPH          = args.includes('--no-graph');
const NO_AGENT          = args.includes('--no-agent');
const DRY_RUN           = args.includes('--dry-run');
const USE_TURBO         = args.includes('--turbo');
const USE_DIRECT        = args.includes('--direct'); // bypass /api/ai/agent, call LLM directly
const REQUIRE_INFERENCE = args.includes('--require-inference');
const WRITE_MAP         = args.includes('--write-map'); // regenerate CODEBASE_DIRECTORY_MAP.md after audit
const TIMEOUT           = 90_000;

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};
function stamp() { return new Date().toISOString().slice(0,19).replace('T',' '); }
function fileTs(){ return new Date().toISOString().slice(0,10); }
function bar(pct, w=20) {
  const n = Math.round(pct/100*w);
  return '█'.repeat(n) + '░'.repeat(w-n);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t);
    const body = await r.text();
    try { return { ok: r.ok, status: r.status, data: JSON.parse(body) }; }
    catch { return { ok: r.ok, status: r.status, data: body }; }
  } catch(e) { clearTimeout(t); return { ok: false, data: null, error: e.message }; }
}
async function postJson(url, body, extra = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BYPASS, ...extra.headers },
    body: JSON.stringify(body),
    timeout: extra.timeout ?? TIMEOUT,
  });
}

// ── Direct LLM call (no dev server, no /api/ai/agent) ────────────────────────
// Tries TurboQuant (:8090 OpenAI-compat) then Ollama (:11434) directly.
async function directLLMCall(prompt, { timeoutMs = 60_000 } = {}) {
  const backends = [
    {
      name: 'turboquant',
      healthUrl: `${TURBO_URL}/health`,
      url: `${TURBO_URL}/v1/chat/completions`,
      body: (p) => ({ model: 'gemma4-legal', messages: [{ role: 'user', content: p }], max_tokens: 1024, temperature: 0.3 }),
      extract: (d) => d?.choices?.[0]?.message?.content,
    },
    {
      name: 'ollama',
      healthUrl: `http://localhost:11434/api/tags`,
      url: `http://localhost:11434/api/chat`,
      body: (p) => ({ model: 'gemma4-legal-vlm:latest', messages: [{ role: 'user', content: p }], stream: false }),
      extract: (d) => d?.message?.content,
    },
  ];
  for (const b of backends) {
    const health = await fetchJson(b.healthUrl, { timeout: 3_000 });
    if (!health.ok) continue;
    const res = await fetchJson(b.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b.body(prompt)),
      timeout: timeoutMs,
    });
    const text = res.ok ? b.extract(res.data) : null;
    if (text) return { answer: text.trim(), backend: b.name };
  }
  return null;
}

// ── Node-native file helpers (Windows-safe, no shell) ────────────────────────
const CODE_EXTS = new Set(['.ts', '.svelte', '.js', '.mjs', '.mts']);

function grepCount(pattern, dir, extFilter = null) {
  const re = new RegExp(pattern, 'gm');
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (extFilter && !extFilter.includes(ext)) continue;
      if (!CODE_EXTS.has(ext)) continue;
      try {
        const m = readFileSync(path.join(dir, entry.name), 'utf8').match(re);
        if (m) count += m.length;
      } catch { /* unreadable */ }
    }
  } catch { /* dir unreadable */ }
  return count;
}

function rgCount(pattern, dir, extraArgs = '') {
  const svelteOnly = extraArgs.includes('.svelte');
  return grepCount(pattern, dir, svelteOnly ? ['.svelte'] : null);
}

function lineCount(dir) {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!CODE_EXTS.has(path.extname(entry.name))) continue;
      try {
        total += readFileSync(path.join(dir, entry.name), 'utf8').split('\n').length;
      } catch { /* unreadable */ }
    }
  } catch { /* dir unreadable */ }
  return total;
}

// ── Phase 1: Enumerate directories ───────────────────────────────────────────
async function enumerateDirs() {
  const targetPath = path.join(SRC, TARGET_ARG);
  if (!existsSync(targetPath)) {
    console.error(c.red(`❌ Target not found: ${targetPath}`));
    process.exit(1);
  }

  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 1 — Directory Enumeration')}`);
  console.log(c.cyan('═'.repeat(64)));

  const dirs = [];
  async function walk(dir, depth) {
    if (depth > DEPTH) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }

    const tsFiles  = entries.filter(e => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.svelte')));
    const subDirs  = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');

    if (tsFiles.length >= MIN_FILES) {
      const rel = path.relative(SRC, dir).replace(/\\/g, '/');
      dirs.push({
        rel,
        abs: dir,
        tsCount:  tsFiles.length,
        subCount: subDirs.length,
        files:    tsFiles.map(e => e.name),
      });
    }

    for (const sub of subDirs) {
      await walk(path.join(dir, sub.name), depth + 1);
    }
  }

  await walk(targetPath, 0);
  dirs.sort((a, b) => b.tsCount - a.tsCount);
  const limited = dirs.slice(0, LIMIT);

  console.log(`  Found ${dirs.length} directories (auditing top ${limited.length})`);
  return limited;
}

// ── Phase 2: rg structural metrics per dir ────────────────────────────────────
async function structuralMetrics(dirs) {
  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 2 — rg Structural Metrics')}`);
  console.log(c.cyan('═'.repeat(64)));

  for (const d of dirs) {
    const abs = d.abs;

    d.metrics = {
      lines:          lineCount(abs),
      exports:        rgCount('export (async function|function|class|const|interface|type)', abs),
      authGuards:     rgCount('locals\\.user|requireAuth|getSession', abs),
      zodValidation:  rgCount('import.*zod|from.*zod|z\\.object|z\\.string', abs),
      todoCount:      rgCount('TODO|FIXME|HACK|XXX', abs),
      hardcodedUrls:  rgCount('localhost|127\\.0\\.0\\.1', abs),
      fetchCalls:     rgCount("fetch\\('|fetch\\(\\`", abs),
      dbQueries:      rgCount('db\\.select|db\\.insert|db\\.update|pool\\.query', abs),
      qdrantCalls:    rgCount('qdrant\\.|Qdrant|qdrantClient', abs),
      redisCalls:     rgCount('redis\\.(get|set|setex|del|exists)|getRedis', abs),
      ollamaCalls:    rgCount('ollamaFetch|bifrostChat|VLM_MODELS', abs),
      importCount:    rgCount('^import ', abs),
      svelte4:        rgCount('export let |on:click|\\$:', abs, '--include="*.svelte"'),
    };

    // Score: 0-100 (higher = better production readiness)
    const m = d.metrics;
    const hasZod    = m.zodValidation > 0 ? 20 : 0;
    const hasAuth   = (m.authGuards > 0 || m.fetchCalls === 0) ? 20 : 0;
    const lowTodo   = m.todoCount === 0 ? 15 : m.todoCount < 3 ? 10 : 0;
    const noHardUrl = m.hardcodedUrls === 0 ? 20 : 0;
    const noSvelte4 = m.svelte4 === 0 ? 15 : 0;
    const hasExports= m.exports > 0 ? 10 : 0;
    d.score = hasZod + hasAuth + lowTodo + noHardUrl + noSvelte4 + hasExports;

    const scoreColor = d.score >= 70 ? c.green : d.score >= 40 ? c.yellow : c.red;
    console.log(`  ${scoreColor(d.score.toString().padStart(3) + '%')} [${bar(d.score)}] ${c.bold(d.rel)} ${c.dim(`(${d.tsCount} files, ${m.lines} lines)`)}`);
    if (m.todoCount > 0)     console.log(`         ${c.yellow(`⚠️  ${m.todoCount} TODO/FIXME`)}`);
    if (m.hardcodedUrls > 0) console.log(`         ${c.yellow(`⚠️  ${m.hardcodedUrls} hardcoded URLs`)}`);
    if (m.svelte4 > 0)       console.log(`         ${c.red(`❌ ${m.svelte4} Svelte 4 patterns`)}`);
  }

  return dirs;
}

// ── Phase 3: ACE/Qdrant semantic retrieval per dir ────────────────────────────
async function aceRetrieval(dirs) {
  if (NO_RAG) {
    console.log(`\n  ${c.dim('⏭  Skipping ACE retrieval (--no-rag)')}`);
    for (const d of dirs) d.ragSummary = null;
    return dirs;
  }

  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 3 — ACE Chunk Retrieval (Qdrant semantic)')}`);
  console.log(c.cyan('═'.repeat(64)));

  for (const d of dirs) {
    // Query Qdrant codebase_chunks_768 for chunks from this directory
    const searchRes = await postJson(
      `${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
      {
        filter: {
          must: [{
            key:   'file_path',
            match: { text: d.rel },
          }],
        },
        limit:        5,
        with_payload: { include: ['file_path', 'tags', 'domain', 'summary', 'chunk_text'] },
      },
      { timeout: 8000 },
    );

    if (searchRes.ok && searchRes.data?.result?.points?.length > 0) {
      const pts = searchRes.data.result.points;
      const tags    = [...new Set(pts.flatMap(p => p.payload?.tags ?? []))].slice(0,8);
      const domains = [...new Set(pts.map(p => p.payload?.domain).filter(Boolean))];
      const summaries = pts.map(p => p.payload?.summary).filter(Boolean).slice(0,2);

      d.ragSummary = { tags, domains, summaries, chunkCount: pts.length };
      console.log(`  ${c.green('✅')} ${d.rel} — tags: ${c.dim(tags.slice(0,5).join(', ') || 'none')}`);
    } else {
      // Fallback: search by directory name as semantic query via ACE
      const aceRes = await postJson(
        `${DEV_SERVER}/api/ace`,
        { query: `files and purpose of ${d.rel}`, limit: 3 },
        { timeout: 10000 },
      );
      if (aceRes.ok && aceRes.data?.chunks?.length > 0) {
        d.ragSummary = {
          tags:     [],
          domains:  [],
          summaries: aceRes.data.chunks.slice(0,2).map(ch => ch.text?.slice(0,200)),
          chunkCount: aceRes.data.chunks.length,
        };
        console.log(`  ${c.yellow('~')}  ${d.rel} — ACE fallback (${aceRes.data.chunks.length} chunks)`);
      } else {
        d.ragSummary = null;
        console.log(`  ${c.dim('–')}  ${d.rel} — no semantic data`);
      }
    }
  }

  return dirs;
}

// ── Phase 4: 4D hyperedge topology lookup ────────────────────────────────────
async function hyperedgeContext(dirs) {
  if (NO_GRAPH) {
    console.log(`\n  ${c.dim('⏭  Skipping graph lookup (--no-graph)')}`);
    for (const d of dirs) d.hyperedge = null;
    return dirs;
  }

  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 4 — 4D Hyperedge Topology Context')}`);
  console.log(c.cyan('═'.repeat(64)));

  // Pull top hyperedges from Redis — key hg:edge:idx is a sorted set
  let topEdges = [];
  try {
    const edgeRes = await fetchJson(
      `${DEV_SERVER}/api/codebase-index/hyperedge-stats`,
      { timeout: 5000 },
    );
    if (edgeRes.ok && edgeRes.data?.edges) {
      topEdges = edgeRes.data.edges.slice(0, 50);
    }
  } catch { /* Redis not available */ }

  for (const d of dirs) {
    // Match hyperedges that reference files in this directory
    const matching = topEdges.filter(e =>
      (e.nodes ?? []).some(n => typeof n === 'string' && n.includes(d.rel))
    );

    if (matching.length > 0) {
      d.hyperedge = {
        edgeCount:  matching.length,
        topGrade:   matching[0]?.grade ?? 'C',
        avgReward:  (matching.reduce((s,e) => s + (e.grpoReward ?? 0), 0) / matching.length).toFixed(3),
        clusters:   [...new Set(matching.map(e => e.clusterId).filter(Boolean))],
      };
      console.log(`  ${c.green('✅')} ${d.rel} — ${matching.length} hyperedges, grade ${d.hyperedge.topGrade}, reward ${d.hyperedge.avgReward}`);
    } else {
      d.hyperedge = null;
      console.log(`  ${c.dim('–')}  ${d.rel} — no hyperedge data`);
    }
  }

  return dirs;
}

// ── Phase 5: Gemma4 agent summarization ──────────────────────────────────────
async function agentSummarize(dirs) {
  if (NO_AGENT) {
    console.log(`\n  ${c.dim('⏭  Skipping agent summarization (--no-agent)')}`);
    for (const d of dirs) d.agentSummary = null;
    return { dirs, infResult: null };
  }

  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 5 — Gemma4 Agent Summarization')}`);
  console.log(c.cyan('═'.repeat(64)));

  // Only summarize directories with score < 70 (need the most attention)
  const needsAttention = dirs.filter(d => d.score < 70).slice(0, 8);

  // Build a single batched prompt covering all low-scoring dirs
  if (needsAttention.length === 0) {
    console.log(`  ${c.green('✅')} All directories scored ≥70 — skipping agent pass`);
    for (const d of dirs) d.agentSummary = null;
    return { dirs, infResult: null };
  }

  const dirList = needsAttention.map(d => {
    const m = d.metrics;
    const r = d.ragSummary;
    return `- \`${d.rel}/\` (score ${d.score}/100, ${d.tsCount} files, ${m.lines} lines)
  Tags: ${r?.tags?.slice(0,5).join(', ') || 'unknown'}
  Issues: ${[
    m.todoCount > 0   && `${m.todoCount} TODO/FIXME`,
    m.hardcodedUrls > 0 && `${m.hardcodedUrls} hardcoded URLs`,
    m.svelte4 > 0     && `${m.svelte4} Svelte 4 patterns`,
    m.zodValidation === 0 && m.fetchCalls > 0 && 'no Zod validation',
    m.authGuards === 0 && m.dbQueries > 0 && 'no auth guard',
  ].filter(Boolean).join(', ') || 'none flagged'}`;
  }).join('\n');

  const prompt =
    `You are auditing a SvelteKit legal AI codebase for production readiness and directory consolidation.\n\n` +
    `The following directories have production readiness scores below 70/100:\n\n${dirList}\n\n` +
    `For each directory:\n` +
    `1. Identify what it does (1 sentence)\n` +
    `2. State the biggest production gap (auth/zod/hardcoded-url/svelte4/todo)\n` +
    `3. Recommend: KEEP as-is, MERGE into a sibling (name it), or REFACTOR\n` +
    `4. Give the fix command or code snippet (max 3 lines)\n\n` +
    `Be concise. Format as a numbered list per directory.`;

  // --direct skips ensureInference (calls LLM directly, no /api/ai/agent health check needed)
  let infResult = { ok: true, backend: USE_DIRECT ? 'direct' : 'unknown', baseUrl: '' };
  if (!USE_DIRECT) {
    infResult = await ensureInference({
      turbo: USE_TURBO,
      requireInference: REQUIRE_INFERENCE,
      baseUrl: TURBO_URL,
    });
    if (!infResult.ok) {
      console.log(`  ${c.yellow('⚠️')}  No LLM backend (${infResult.reason ?? 'unavailable'}) — skipping agent summarization`);
      for (const d of dirs) d.agentSummary = null;
      return { dirs, infResult };
    }
  }

  console.log(`  Sending ${needsAttention.length} directories to Gemma4 ${USE_DIRECT ? '(direct LLM)' : `agent (via ${infResult.backend})`}...`);
  const t0 = Date.now();

  let answer = null;

  if (USE_DIRECT) {
    // --direct: call TurboQuant or Ollama directly — no /api/ai/agent, no dev server, no SvelteKit 120s timeout
    const result = await directLLMCall(prompt, { timeoutMs: 60_000 });
    answer = result?.answer ?? null;
    const ms2 = Date.now() - t0;
    if (answer) {
      console.log(`  ${c.green('✅')} Direct LLM response (${ms2}ms, backend:${result.backend})`);
    } else {
      console.log(`  ${c.yellow('⚠️')}  Direct LLM unavailable — continuing without AI summary`);
    }
  } else {
    // /api/ai/agent path (requires dev server)
    let res = await postJson(
      `${DEV_SERVER}/api/ai/agent`,
      { query: prompt, pipeline: 'ace', tools: ['rag_search', 'hyperedge_stats'] },
      { timeout: 120_000 },
    );
    if (!res.ok && (res.error?.includes('abort') || res.error?.includes('timeout') || res.status === 0)) {
      console.log(`  ${c.yellow('⚠️')}  First attempt timed out — retrying with ${infResult.backend}...`);
      res = await postJson(
        `${DEV_SERVER}/api/ai/agent`,
        { query: prompt, pipeline: 'ace', tools: ['rag_search', 'hyperedge_stats'] },
        { timeout: 120_000 },
      );
    }
    const ms2 = Date.now() - t0;
    if (res.ok && res.data?.answer) {
      console.log(`  ${c.green('✅')} Agent response (${ms2}ms, ${res.data.rounds} rounds)`);
      answer = res.data.answer;
    } else {
      const err = res.data?.message ?? res.data?.error ?? res.error ?? 'timeout';
      console.log(`  ${c.yellow('⚠️')}  Agent unavailable (${err.slice(0,60)}) — continuing without AI summary`);
    }
  }

  if (answer) {
    for (const d of needsAttention) d.agentSummary = answer;
  }
  for (const d of dirs) if (!d.agentSummary) d.agentSummary = null;

  return { dirs, infResult };
}

// ── Phase 6: Write plan ────────────────────────────────────────────────────────
async function writePlan(dirs, infResult) {
  console.log(`\n${c.cyan('═'.repeat(64))}`);
  console.log(`${c.cyan('█')} ${c.bold('Phase 6 — Writing Directory Audit Plan')}`);
  console.log(c.cyan('═'.repeat(64)));

  const stamp = new Date().toISOString().slice(0,19).replace('T',' ');
  const critical = dirs.filter(d => d.score < 40);
  const warn     = dirs.filter(d => d.score >= 40 && d.score < 70);
  const good     = dirs.filter(d => d.score >= 70);
  const agentSummary = dirs.find(d => d.agentSummary)?.agentSummary;

  const dirTable = dirs.map(d => {
    const m = d.metrics;
    const issues = [
      m.todoCount > 0      && `${m.todoCount} TODOs`,
      m.hardcodedUrls > 0  && `${m.hardcodedUrls} hardcoded`,
      m.svelte4 > 0        && 'svelte4',
      m.zodValidation === 0 && m.fetchCalls > 0 && 'no-zod',
      m.authGuards === 0   && m.dbQueries > 0 && 'no-auth',
    ].filter(Boolean).join(', ');
    const tags = d.ragSummary?.tags?.slice(0,4).join(' ') ?? '';
    const grade = d.hyperedge?.topGrade ?? '-';
    return `| \`${d.rel}/\` | ${d.tsCount} | ${d.score} | ${issues || '✅'} | ${grade} | ${tags} |`;
  }).join('\n');

  const consolidateCandidates = dirs
    .filter(d => d.tsCount <= 2)
    .map(d => `- \`${d.rel}/\` (${d.tsCount} file${d.tsCount===1?'':'s'}) — merge into parent or nearest sibling`);

  const plan = `# Deep Directory Audit — ${stamp}

> Target: \`src/${TARGET_ARG}/\`
> Generated by \`scripts/tests/deep-directory-audit.mjs\`
> Depth: ${DEPTH} | Min files: ${MIN_FILES} | Directories audited: ${dirs.length}

## Summary

| Category | Count |
|----------|-------|
| 🔴 Critical (score < 40) | ${critical.length} |
| 🟡 Warning  (score 40-69) | ${warn.length} |
| 🟢 Good     (score ≥ 70) | ${good.length} |
| Total directories | ${dirs.length} |

## Inference Backend

${infResult ? inferenceMarkdownTable(infResult) : '_Agent summarization skipped (--no-agent)_'}

## Full Directory Scoreboard

| Directory | Files | Score | Issues | HG Grade | Tags |
|-----------|-------|-------|--------|----------|------|
${dirTable}

**Score breakdown:** Zod(20) + Auth(20) + NoTODO(15) + NoHardURL(20) + NoSvelte4(15) + HasExports(10) = 100

## Critical Directories (Score < 40)

${critical.length === 0 ? '✅ None — all directories score ≥ 40' :
  critical.map(d => {
    const m = d.metrics;
    return `### \`${d.rel}/\` — Score ${d.score}/100

- Files: ${d.tsCount} | Lines: ${m.lines}
- Exports: ${m.exports} | DB queries: ${m.dbQueries} | Fetch calls: ${m.fetchCalls}
- Auth guards: ${m.authGuards} | Zod schemas: ${m.zodValidation}
- TODOs: ${m.todoCount} | Hardcoded URLs: ${m.hardcodedUrls} | Svelte 4: ${m.svelte4}
${d.ragSummary?.tags?.length ? `- Semantic tags: \`${d.ragSummary.tags.join('`, `')}\`` : ''}
${d.hyperedge ? `- Hyperedge grade: ${d.hyperedge.topGrade} | Avg reward: ${d.hyperedge.avgReward} | Clusters: ${d.hyperedge.clusters.join(', ')}` : ''}
`;
  }).join('\n')
}

## Warning Directories (Score 40-69)

${warn.length === 0 ? '✅ None' :
  warn.map(d => {
    const m = d.metrics;
    const issues = [
      m.todoCount > 0      && `**${m.todoCount} TODOs** — review and resolve`,
      m.hardcodedUrls > 0  && `**${m.hardcodedUrls} hardcoded localhost URLs** — move to \`env.server.ts\``,
      m.svelte4 > 0        && `**${m.svelte4} Svelte 4 patterns** — migrate to runes`,
      m.zodValidation === 0 && m.fetchCalls > 0 && '**No Zod validation** — add input schemas',
      m.authGuards === 0   && m.dbQueries > 0 && '**No auth guard** — add \`locals.user\` check',
    ].filter(Boolean);
    return `- \`${d.rel}/\` (${d.score}/100) — ${issues.join('; ') || 'minor issues'}`;
  }).join('\n')
}

## Consolidation Candidates (≤2 files)

${consolidateCandidates.length === 0 ? '✅ No tiny directories found' : consolidateCandidates.join('\n')}

### Merge Checklist

Before merging any directory:
\`\`\`bash
# 1. Verify no consumers depend on path
rg "from.*<DIR_NAME>" src/ --type ts --type svelte

# 2. Check barrel exports
rg "<DIR_NAME>" src/lib/*/index.ts

# 3. Move files
git mv src/lib/<dir>/* src/lib/<parent>/

# 4. Update imports
rg -l "from.*<dir>/<file>" src/ | xargs sed -i 's|from.*<dir>/<file>|from ../<parent>/<file>|g'

# 5. Verify
npm run check:ts7 && npm run check
\`\`\`

## Gemma4 Agent Recommendations

${agentSummary ?? '_Agent not available — run with Ollama :11434 or --turbo for AI recommendations_'}

## Semantic Context (ACE / Qdrant)

${dirs.filter(d => d.ragSummary?.summaries?.length).slice(0, 10).map(d =>
  `### \`${d.rel}/\`\n\n` +
  (d.ragSummary?.summaries ?? []).map(s => `> ${s}`).join('\n\n')
).join('\n\n') || '_No semantic summaries available (run codebase indexer first)_'}

## 4D Hyperedge Context

${dirs.filter(d => d.hyperedge).slice(0, 10).map(d =>
  `- \`${d.rel}/\`: grade **${d.hyperedge.topGrade}**, ${d.hyperedge.edgeCount} edges, ` +
  `avg GRPO reward ${d.hyperedge.avgReward}, clusters [${d.hyperedge.clusters.join(', ')}]`
).join('\n') || '_No hyperedge data (run standalone hypergraph pipeline first)_'}

## Fix Priority Queue

${[...critical, ...warn]
  .sort((a,b) => a.score - b.score)
  .slice(0, 15)
  .map((d, i) => {
    const m = d.metrics;
    const fixes = [
      m.hardcodedUrls > 0 && '`env.server.ts` for hardcoded URLs',
      m.zodValidation === 0 && m.fetchCalls > 0 && 'add Zod schemas',
      m.authGuards === 0 && m.dbQueries > 0 && 'add auth guard',
      m.svelte4 > 0 && 'migrate Svelte 4 → runes',
      m.todoCount > 0 && 'resolve TODOs',
    ].filter(Boolean);
    return `${i+1}. \`${d.rel}/\` (${d.score}/100) — ${fixes.join(', ')}`;
  }).join('\n') || '✅ No priority fixes needed'}

## Validation Commands

\`\`\`bash
# After fixing, verify:
npm run check:ts7            # TS7 (fast)
npm run check                # svelte-check (thorough)
npm run ci:all               # full CI gate

# Re-audit this target:
node scripts/tests/deep-directory-audit.mjs ${TARGET_ARG} --no-agent
\`\`\`
`;

  if (DRY_RUN) {
    console.log('\n' + plan.split('\n').slice(0, 40).join('\n'));
    console.log(c.dim(`\n... [${plan.split('\n').length - 40} more lines — remove --dry-run to write]`));
  } else {
    if (!existsSync(PLANS_DIR)) await mkdir(PLANS_DIR, { recursive: true });
    const fname = `${fileTs()}-dir-audit-${TARGET_ARG.replace(/\//g, '-')}.md`;
    const out = path.join(PLANS_DIR, fname);
    await writeFile(out, plan, 'utf8');
    console.log(`\n  ${c.green('✅')} Written: ${c.cyan(out)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.bold(`\n🔬 Deep Directory Audit — src/${TARGET_ARG}/`));
  console.log(c.dim(`   Depth: ${DEPTH} | Limit: ${LIMIT} | Started: ${stamp()}`));
  console.log(c.dim(`   RAG: ${!NO_RAG} | Graph: ${!NO_GRAPH} | Agent: ${!NO_AGENT} | DryRun: ${DRY_RUN}`));

  let dirs = await enumerateDirs();
  dirs     = await structuralMetrics(dirs);
  dirs     = await aceRetrieval(dirs);
  dirs     = await hyperedgeContext(dirs);
  const { dirs: auditedDirs, infResult } = await agentSummarize(dirs);
  await writePlan(auditedDirs, infResult);

  // Push directory summaries into the graph layer (fire-and-forget)
  if (!DRY_RUN) {
    const dirOutputs = auditedDirs.map(d => ({
      rel: d.rel,
      score: d.score ?? 50,
      metrics: d.metrics ?? {},
      ragSummary: d.ragSummary ?? null,
      agentSummary: d.agentSummary ?? null,
      hyperedge: d.hyperedge ?? null,
    }));
    fetch(`${DEV_SERVER}/api/codebase-index/directory-summaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BYPASS },
      body: JSON.stringify({ dirOutputs }),
    })
      .then(r => r.json())
      .then(r => console.log(c.dim(`  [graph] directory-summaries ingested: ${JSON.stringify(r)}`)))
      .catch(e => console.warn(c.dim(`  [graph] directory-summaries skipped: ${e.message}`)));
  }

  const critical = auditedDirs.filter(d => d.score < 40).length;
  const warned   = auditedDirs.filter(d => d.score >= 40 && d.score < 70).length;
  console.log(`\n  ${c.bold('Done.')} ${c.red(`${critical} critical`)}  ${c.yellow(`${warned} warn`)}  ${c.green(`${auditedDirs.length - critical - warned} good`)}\n`);

  // --write-map: regenerate CODEBASE_DIRECTORY_MAP.md after audit completes
  if (WRITE_MAP && !DRY_RUN) {
    console.log(c.dim('  [map] Regenerating CODEBASE_DIRECTORY_MAP.md...'));
    try {
      const { spawnSync } = await import('child_process');
      const mapScript = path.join(__dirname, 'generate-codebase-directory-map.mjs');
      const result = spawnSync(process.execPath, [mapScript], { stdio: 'inherit' });
      if (result.status !== 0) {
        console.warn(c.yellow('  [map] Map generator exited with error — run manually: npm run audit:dirs:map'));
      }
    } catch (e) {
      console.warn(c.yellow(`  [map] Map generator failed: ${e.message}`));
    }
  }

  process.exit(critical > 0 ? 1 : 0);
}

main().catch(e => { console.error(c.red('\n❌'), e.message); process.exit(1); });
