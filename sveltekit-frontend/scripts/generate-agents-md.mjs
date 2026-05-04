#!/usr/bin/env node
/**
 * generate-agents-md.mjs
 *
 * Emits AGENTS.md per directory by joining:
 *   - Redis KAG notes      (wiki:note:dir:*)   — purpose, summary, audit, neighbors
 *   - Graph JSON           (docs/graph/codebase-graph.json) — per-file gate flags
 *
 * Implements the agents.md convention (https://agents.md):
 *   - Plain Markdown, no frontmatter required
 *   - Per-directory files; agents walk up the tree from the file under work
 *   - Subdirectory files ADD context (don't replace root)
 *
 * Output:
 *   AGENTS.md                                — root (repo overview + audit dashboard)
 *   sveltekit-frontend/AGENTS.md             — frontend overview
 *   sveltekit-frontend/src/routes/.../AGENTS.md       — per-route-dir context
 *   sveltekit-frontend/src/lib/server/.../AGENTS.md   — per-server-module context
 *
 * Flags:
 *   --dry-run                Print what would be written, no file IO
 *   --root-only              Write only root AGENTS.md
 *   --min-files N            Skip dirs with fewer than N files (default 2)
 *   --filter <substring>     Only generate for dirs matching substring
 *   --threshold-warn N       Add ⚠️ to dirs with auditScore < N (default 70)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const GRAPH_JSON    = path.join(FRONTEND_ROOT, 'docs/graph/codebase-graph.json');
const CLUSTERS_JSON = path.join(FRONTEND_ROOT, 'docs/graph/hypergraph-clusters.json');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ROOT_ONLY = argv.includes('--root-only');
function flagValue(name) {
  const eq = argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
}
const MIN_FILES = parseInt(flagValue('--min-files') ?? '2', 10);
const FILTER = flagValue('--filter');
const WARN_THRESHOLD = parseInt(flagValue('--threshold-warn') ?? '70', 10);

// Stable marker for human-edit detection (don't include timestamp here — it
// breaks idempotency). Pair with a separate timestamp line below.
const HEADER_MARKER = '<!-- AGENTS-GEN v1 · do not edit below this line -->';
const STAMP = `${HEADER_MARKER}\n<!-- generated: ${new Date().toISOString()} · agents.md spec · regen: npm run agents:write -->`;

// ── Connect to Redis ─────────────────────────────────────────────────────────
let redis = null;
try {
  const { default: Redis } = await import('ioredis');
  const candidate = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect:          true,    // don't auto-connect; do it explicitly so we can await it
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   true,    // allow queued commands while connecting (prevents Stream-not-writeable race)
    connectTimeout:       2000,
    retryStrategy:        () => null,  // do not retry — fail fast if the first attempt fails
  });
  // Suppress the noisy unhandled-error event on the offline path
  candidate.on('error', () => { /* swallowed; we'll detect failure via ping */ });
  await candidate.connect();
  await candidate.ping();
  redis = candidate;
} catch (e) {
  console.warn(`⚠️  Redis unavailable (${e.message}) — KAG notes won't enrich the output`);
  if (redis) { try { redis.disconnect(); } catch {} redis = null; }
}

async function rget(key) {
  if (!redis) return null;
  try {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

// ── Load graph JSON ──────────────────────────────────────────────────────────
if (!existsSync(GRAPH_JSON)) {
  console.error(`✗ ${GRAPH_JSON} not found — run 'npm run index:codebase:fast' first`);
  process.exit(1);
}
const graph = JSON.parse(readFileSync(GRAPH_JSON, 'utf8'));
const files = graph.files ?? [];
const gateStats = graph.gateStats ?? {};

// ── Optional: load hypergraph clusters and build dir → dominant cluster map ──
const dirCluster = new Map();   // dir → { id, topic, kinds, tags }
if (existsSync(CLUSTERS_JSON)) {
  try {
    const cd = JSON.parse(readFileSync(CLUSTERS_JSON, 'utf8'));
    const dirHits = new Map();
    for (const cluster of cd.clusters ?? []) {
      const cid = cluster.id;
      for (const e of cluster.topDirs ?? []) {
        const d = String(e.dir ?? '').replace(/\\/g, '/');
        if (!d) continue;
        const k = `${d}|${cid}`;
        dirHits.set(k, (dirHits.get(k) ?? 0) + (e.count ?? 1));
      }
      for (const e of cluster.topPaths ?? []) {
        const p = String(e.path ?? '').replace(/\\/g, '/');
        if (!p) continue;
        const d = p.split('/').slice(0, -1).join('/');
        if (!d) continue;
        const k = `${d}|${cid}`;
        dirHits.set(k, (dirHits.get(k) ?? 0) + (e.count ?? 1));
      }
    }
    for (const [k, hits] of dirHits) {
      const [dir, cidStr] = k.split('|');
      const cid = Number(cidStr);
      const ex  = dirCluster.get(dir);
      if (!ex || ex.hits < hits || (ex.hits === hits && cid < ex.id)) {
        const c = (cd.clusters ?? []).find(x => x.id === cid);
        dirCluster.set(dir, {
          id:    cid,
          topic: c?.inferredTopic ?? '',
          kinds: c?.topKinds   ?? [],
          tags:  c?.topTags    ?? [],
          hits,
        });
      }
    }
  } catch { /* malformed — skip */ }
}

// ── Group files by directory ─────────────────────────────────────────────────
const dirMap = new Map();
for (const f of files) {
  const dir = path.dirname(f.rel);
  if (!dirMap.has(dir)) dirMap.set(dir, []);
  dirMap.get(dir).push(f);
}

// Aggregate per-directory metrics from per-file flags
function aggregate(dirFiles) {
  const m = {
    fileCount: dirFiles.length,
    apiCount: 0,
    authCount: 0,
    zodCount: 0,
    ssrUnsafeCount: 0,
    sv4LegacyCount: 0,
    noTestCount: 0,
    todoCount: 0,
    localhostCount: 0,
  };
  for (const f of dirFiles) {
    if (f.routeHandlers && f.routeHandlers.length > 0 && (f.rel.endsWith('+server.ts') || f.rel.endsWith('+page.server.ts'))) {
      m.apiCount++;
      if (f.hasAuth) m.authCount++;
      if (f.hasZod) m.zodCount++;
      if (!f.hasPairedTest) m.noTestCount++;
    }
    if (f.ssrUnsafe) m.ssrUnsafeCount++;
    if (f.sv4Legacy) m.sv4LegacyCount++;
    if (f.localhostRefs && f.localhostRefs.length > 0) m.localhostCount++;
    m.todoCount += (f.todos?.length ?? 0);
  }
  return m;
}

// Map directory path → Redis KAG key
function kagKey(dirRel) {
  // Wiki note keys use the SvelteKit frontend's `dir:` prefix + slugified path
  // The indexer runs against sveltekit-frontend/src so dirRel is relative to that.
  // Slug: replace / and special chars with _
  const slug = dirRel.replace(/[^a-z0-9]/gi, '_');
  return `wiki:note:dir:dir:${slug}`;
}

// ── Render per-directory AGENTS.md ───────────────────────────────────────────
function renderDirAgents(dirRel, dirFiles, kagDoc, cluster) {
  const m = aggregate(dirFiles);
  const auditScore = kagDoc?.auditScore ?? null;
  const purpose = kagDoc?.purpose ?? `Directory: ${dirRel}`;
  const summary = kagDoc?.summary ?? `${m.fileCount} file(s), ${m.apiCount} handler(s)`;
  const dominantTags = kagDoc?.dominantTags ?? [];
  const topo = kagDoc?.topologicalNeighbors ?? [];
  const patterns = kagDoc?.patterns ?? [];
  const warnings = kagDoc?.warnings ?? [];
  const pageRank = kagDoc?.pageRankTop5 ?? [];

  // Hypergraph cluster section (optional — present when topDirs/topPaths credit this dir)
  const clusterTopic   = cluster?.topic ? cluster.topic.replace(/`/g, '\\`') : null;
  const clusterKinds   = cluster?.kinds?.slice(0, 3).map(k => `${k.kind}×${k.count}`).join(', ');
  const clusterTags    = cluster?.tags?.slice(0, 5).map(t => `\`${t.tag}\``).join(' ');
  const clusterSection = cluster
    ? `## Hypergraph cluster

This directory is part of cluster **C${cluster.id}** — ${clusterTopic}

${clusterKinds ? `- **Top kinds**: ${clusterKinds}` : ''}
${clusterTags  ? `- **Top tags**: ${clusterTags}`   : ''}

See \`docs/graph/hypergraph-clusters.md\` § Cluster ${cluster.id} for full digest.

`
    : '';
  // Fall back to graph-derived list when KAG is absent OR empty
  const kagRep = kagDoc?.representativeFiles;
  const repFiles = (Array.isArray(kagRep) && kagRep.length > 0)
    ? kagRep
    : dirFiles.slice(0, 8).map(f => path.basename(f.rel));

  // Audit summary line
  const authSeg = m.apiCount > 0 ? `Auth: ${m.authCount}/${m.apiCount}` : null;
  const zodSeg  = m.apiCount > 0 ? `Zod: ${m.zodCount}/${m.apiCount}` : null;
  const ssrSeg  = m.ssrUnsafeCount > 0 ? `🔴 SSR-unsafe: ${m.ssrUnsafeCount}` : null;
  const sv4Seg  = m.sv4LegacyCount > 0 ? `🟡 Svelte4: ${m.sv4LegacyCount}` : null;
  const lhSeg   = m.localhostCount > 0 ? `🟠 hardcoded localhost: ${m.localhostCount}` : null;
  const noTestSeg = m.apiCount > 0 ? `tests paired: ${m.apiCount - m.noTestCount}/${m.apiCount}` : null;
  const todoSeg = m.todoCount > 0 ? `TODOs: ${m.todoCount}` : null;
  const auditLine = [authSeg, zodSeg, ssrSeg, sv4Seg, lhSeg, noTestSeg, todoSeg].filter(Boolean).join(' · ') || 'no audit signals';

  const scoreBadge = auditScore !== null
    ? `**${auditScore}/100**${auditScore < WARN_THRESHOLD ? ' ⚠️' : ''}`
    : '_(no GPU audit)_';

  const tagLine = dominantTags.slice(0, 8).map(t => `\`${t}\``).join(' ');
  const topoLines = topo.slice(0, 5).map(t => `- \`${t}\``).join('\n') || '_(none recorded)_';
  const patternsList = patterns.slice(0, 5).map(p => `- ${p}`).join('\n');
  const warningsList = warnings.slice(0, 5).map(w => `- ⚠️ ${w}`).join('\n');
  const fileList = repFiles.slice(0, 8).map(f => `- \`${f}\``).join('\n');
  const pageRankList = pageRank.slice(0, 5).map(p => typeof p === 'string' ? `- \`${p}\`` : `- \`${p.id ?? p.file ?? '?'}\` _(rank ${(p.score ?? p.pageRank ?? 0).toFixed?.(3) ?? '—'})_`).join('\n');

  return `# AGENTS.md — \`${dirRel}\`

${STAMP}

> ${purpose}

## Snapshot

- ${summary}
- Audit score: ${scoreBadge}
- ${auditLine}
${tagLine ? `- Tags: ${tagLine}` : ''}

## Files (${m.fileCount})

${fileList}

${clusterSection}${topoLines.includes('none recorded') ? '' : `## Topological neighbors

${topoLines}
`}${patternsList ? `## Patterns

${patternsList}
` : ''}${warningsList ? `## Warnings

${warningsList}
` : ''}${pageRankList ? `## PageRank top-5 (in this directory)

${pageRankList}
` : ''}
## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- \`graph_search({ query: "${dirRel.split('/').pop()}", topK: 8 })\` — files in this dir with tags, TODOs, audit flags
- \`wiki_note_lookup({ query: "${dirRel.split('/').slice(-2).join(' ')}", limit: 5 })\` — KAG narrative + audit score
- \`audit_hotspots({ limit: 10 })\` — if this dir is failing gates, surfaces the broader hotspot set
- \`read_file({ filePath: "${dirRel}/<file>" })\` — fetch any file's contents (sandboxed to src/)
${m.apiCount > 0 ? `\nFor route handlers in this dir, also try:\n- \`verify_fix({ filePath: "${dirRel}/+server.ts" })\` — runs svelte-check / tsc on a single file` : ''}

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest \`AGENTS.md\` when editing files in this tree. The root \`AGENTS.md\` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run \`npm run agents:write\` to regenerate after \`npm run index:codebase:fast\`.
`;
}

// ── Render root AGENTS.md ────────────────────────────────────────────────────
function renderRootAgents() {
  const apiTotal = files.filter(f => f.isRoute && f.routeHandlers?.length > 0 && (f.rel.endsWith('+server.ts') || f.rel.endsWith('+page.server.ts'))).length;
  const totalDirs = dirMap.size;
  return `# AGENTS.md — Deeds Web App

${STAMP}

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2 + UnoCSS + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> See [\`CLAUDE.md\`](./CLAUDE.md) for the canonical 600-line dev guide. This file is the agents.md-spec entry point — agents.md / Claude Code / Cursor / Codex all read it.

## Repo at a glance

- **Frontend**: \`sveltekit-frontend/\` — SvelteKit + Svelte 5 runes only. ${apiTotal} server routes across ${totalDirs} dirs, ${files.length} indexed files.
- **GPU bridge**: \`simd-bridge/cpp/\` — N-API addon for LibTorch CUDA + simdjson AVX2.
- **Go services**: \`go-microservice/\`, \`services/go-retrieval-service/\` — gRPC :50051-50057 (see \`CLAUDE.md#grpc-port-map\`).
- **Docs**: \`docs/graph/codebase-graph.json\` (auto), \`docs/graph/codebase-map.md\`, \`docs/ace-kag-howto.md\`.

## Audit gate snapshot

| Gate | Status |
|------|--------|
| G4  Auth on API routes | ${gateStats.routesWithAuth ?? '?'}✅ / ${gateStats.routesWithoutAuth ?? '?'}❌ |
| G5  Zod on body-parsing routes | ${gateStats.routesWithZod ?? '?'}✅ / ${gateStats.routesWithoutZod ?? '?'}❌ |
| G15 SSR-unsafe globals (real) | ${gateStats.ssrUnsafeCount ?? '?'}❌ |
| G20 Cyclic import pairs | ${gateStats.cyclicPairCount ?? '?'} |

Refresh: \`npm run index:codebase:fast\` then \`npm run agents:write\`.

## Build / test commands (Frontend)

\`\`\`bash
cd sveltekit-frontend
npm run dev                     # SvelteKit dev server (sets DEV_BYPASS_AUTH)
npx svelte-check --threshold error
npx vitest run                  # all unit tests
npm run test:stubs:progress     # 533 G16 route stubs (serial, ~22 min)
npm run smoke:graphify          # 5-pillar codebase intelligence health check
\`\`\`

## Critical conventions

- **Svelte 5 runes only**. No \`export let\`, no \`$:\`, no \`on:click\`, no \`<slot>\`. See \`CLAUDE.md#svelte-5-runes\`.
- **bits-ui v2.16.2** — namespace imports, \`child\` snippet (not \`asChild\`), \`forceMount\` for transitions.
- **Drizzle imports** — \`from '$lib/server/db/client'\` (Pool), NOT \`db/index\` (postgres.js). Use \`.js\` extensions.
- **Degraded GET response contract** — error path returns same JSON shape with empty defaults, not \`{error}\` only.
- **Auth on API routes** — \`if (!locals.user) return json({...empty defaults..., error: 'Unauthorized'}, {status:401})\`.
- **Zod on body-parsing routes** — every \`request.json()\` / \`request.formData()\` validated before use.
- **Env URLs** — \`ENV.X ?? 'http://localhost:N'\` pattern via \`env.server.ts\`. Never bare hardcoded URLs.

## How agents.md works here

- **Discovery**: nearest \`AGENTS.md\` walking up from the file you're editing wins; subdirectory files ADD context, don't replace.
- **Per-directory files** are auto-generated from Redis KAG notes (\`wiki:note:dir:*\`) + per-file gate flags.
- **Stale detection**: regenerate after every \`graphify:daily\` or \`graphify:full\` run.
- **Compat**: \`CLAUDE.md\` and \`AGENTS.md\` coexist. CLAUDE.md is the canonical long-form guide; AGENTS.md is the agents.md-spec entry point.

## Pointer index

- Root long-form docs: [\`CLAUDE.md\`](./CLAUDE.md), [\`docs/ace-kag-howto.md\`](./docs/ace-kag-howto.md)
- Audit dashboard: [\`sveltekit-frontend/docs/graph/codebase-map.md\`](./sveltekit-frontend/docs/graph/codebase-map.md)
- Per-directory context: \`AGENTS.md\` files throughout \`sveltekit-frontend/src/\`

Generated by \`scripts/generate-agents-md.mjs\` from KAG cache and graph JSON. Regenerate: \`npm run agents:write\`.
`;
}

// ── Render sveltekit-frontend/AGENTS.md (LLM-wiki directory map) ─────────────
// Tree-shaped index of every dir with: cluster id, audit score, KAG slug,
// and the agent tool call to fetch its AGENTS.md. Designed for `agents_md` /
// `wiki_note_lookup` / `graph_search` to land on the right path quickly.
function renderFrontendAgents() {
  // Sort dirs alphabetically; build a 2-deep tree so the output stays readable.
  const sortedDirs = [...dirMap.keys()].sort();
  const lines = [];

  // Group by top-level child of src/
  const groups = new Map(); // 'lib' or 'routes' or 'lib/server' (depth-2) → [dirs]
  for (const dir of sortedDirs) {
    const parts = dir.split('/');
    if (parts[0] !== 'src') continue;
    const key = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : (parts[1] ?? 'src');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(dir);
  }

  for (const [group, dirs] of [...groups.entries()].sort()) {
    lines.push(`### \`src/${group}/\` (${dirs.length} dir${dirs.length === 1 ? '' : 's'})`);
    lines.push('');
    lines.push('| Dir | Files | Score | Cluster | KAG slug | Quick tool call |');
    lines.push('|-----|-------|-------|---------|----------|-----------------|');
    for (const dir of dirs) {
      const dirFiles = dirMap.get(dir) ?? [];
      if (dirFiles.length < MIN_FILES) continue;  // match per-dir filter
      const cluster = dirCluster.get(dir);
      const slug = dir.replace(/[^a-z0-9]/gi, '_');
      const clusterCell = cluster ? `C${cluster.id}` : '—';
      // Score is approximate without KAG — show graph aggregates only
      const m = aggregate(dirFiles);
      const scoreCell = m.apiCount > 0
        ? `${m.authCount}/${m.apiCount} auth`
        : (m.ssrUnsafeCount > 0 ? `🔴 ${m.ssrUnsafeCount} ssr` : '—');
      const tool = `\`agents_md({ path: "${dir}" })\``;
      lines.push(`| \`${dir}\` | ${dirFiles.length} | ${scoreCell} | ${clusterCell} | \`${slug}\` | ${tool} |`);
    }
    lines.push('');
  }

  return `# AGENTS.md — \`sveltekit-frontend/\` (LLM directory wiki)

${STAMP}

> SvelteKit 2 + Svelte 5 (runes) + bits-ui v2 + UnoCSS + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> Per-directory AGENTS.md files are scattered throughout \`src/\` — agents walk UP from any file to the nearest one. **This file is the directory index** so agents (and humans) can quickly jump to a dir's KAG slug or fire the right tool call.

## Pipeline at a glance

| Stage | Command | Output |
|-------|---------|--------|
| 1. Fast AST | \`npm run index:codebase:fast\` | \`docs/graph/codebase-graph.json\` + Redis \`code:index:*\` + \`wiki:note:dir:*\` |
| 2. Semantic | \`npm run codebase:index\` | Qdrant \`codebase_chunks_768\` (~32k 768-dim vectors) |
| 3. Topology | \`npm run graphify:topology\` | k-means K=100 + Qdrant \`som_cluster\` tags + \`hypergraph-clusters.json\` digest |
| 4. Wiki | \`npm run agents:write\` | This file + ~250 per-dir AGENTS.md |
| All | \`npm run graphify:full\` | Stages 1-4 + smoke (10/10 pillars green) |

## Agentic tool surface (Gemma4)

These tools are wired in-process in [\`src/lib/server/ai/gemma4-agent.ts\`](./src/lib/server/ai/gemma4-agent.ts):

- \`agents_md({ path })\` — fetch the per-dir AGENTS.md for any path (this map's primary consumer)
- \`graph_search({ query, topK })\` — file/tag lookup via codebase-graph.json
- \`wiki_note_lookup({ query, limit })\` — Redis \`wiki:note:dir:dir:<slug>\` KAG narratives
- \`audit_hotspots({ limit })\` — bottom-N audit-score directories
- \`read_file({ filePath })\` — sandboxed src/ file fetch
- \`verify_fix({ filePath })\` — single-file svelte-check
- \`rag_search({ query, collection, topK })\` — Qdrant hybrid search
- \`memory_recall({ query, topK })\` — top hyperedge memory modules
- \`hyperedge_stats({ minGrade, limit })\` — top quality clusters

## Audit gates (this run)

| Gate | Status |
|------|--------|
| G4  Auth on API routes | ${gateStats.routesWithAuth ?? 0}✅ / ${gateStats.routesWithoutAuth ?? 0}❌ |
| G5  Zod on body-parsing routes | ${gateStats.routesWithZod ?? 0}✅ / ${gateStats.routesWithoutZod ?? 0}❌ |
| G15 SSR-unsafe globals | ${gateStats.ssrUnsafeCount ?? 0}❌ |
| G16 Routes without tests | ${gateStats.routesWithoutTest ?? 0}❌ |
| G20 Cyclic import pairs | ${gateStats.cyclicPairCount ?? 0} |

Refresh with \`npm run index:codebase:fast && npm run agents:write\`.

## Directory tree map

${lines.join('\n')}

## How to use this file

When an agent (or human) needs to work in a directory:

1. **Look up the dir in the table above** — copy the KAG slug and quick tool call.
2. **Fire \`agents_md({ path: "<dir>" })\`** — the agent reads the dir's full AGENTS.md (includes cluster + KAG narrative + tool-calling hints).
3. **For deeper context, chain**: \`wiki_note_lookup\` → \`graph_search\` → \`read_file\`.

The per-dir AGENTS.md files live INSIDE the directories themselves (e.g. \`src/lib/server/cache/AGENTS.md\`), so any agent walking UP the tree from a file under work picks them up automatically.

Run \`npm run agents:write\` to regenerate after \`npm run index:codebase:fast\`.
`;
}

// ── Write loop ───────────────────────────────────────────────────────────────
const root = renderRootAgents();
const frontend = renderFrontendAgents();
let wrote = 0, skipped = 0;
const tasks = [];

// Always emit the repo-root AGENTS.md and the frontend-root AGENTS.md
const rootPath     = path.join(REPO_ROOT,     'AGENTS.md');
const frontendPath = path.join(FRONTEND_ROOT, 'AGENTS.md');
tasks.push({ path: rootPath,     content: root,     label: 'root' });
tasks.push({ path: frontendPath, content: frontend, label: 'frontend' });

if (!ROOT_ONLY) {
  for (const [dirRel, dirFiles] of dirMap.entries()) {
    if (dirFiles.length < MIN_FILES) { skipped++; continue; }
    if (FILTER && !dirRel.includes(FILTER)) { skipped++; continue; }

    const kagDoc = await rget(kagKey(dirRel));
    const cluster = dirCluster.get(dirRel) ?? null;
    const md = renderDirAgents(dirRel, dirFiles, kagDoc, cluster);

    // Output goes under sveltekit-frontend/<dirRel>/AGENTS.md
    const outPath = path.join(FRONTEND_ROOT, dirRel, 'AGENTS.md');
    tasks.push({ path: outPath, content: md, label: dirRel, kag: !!kagDoc });
  }
}

console.log(`📋 ${tasks.length} AGENTS.md target(s) (${skipped} dirs skipped — too small or filtered out)`);
if (DRY_RUN) {
  for (const t of tasks.slice(0, 12)) {
    console.log(`  [dry] ${path.relative(REPO_ROOT, t.path)}  (${t.kag ? 'KAG-enriched' : 'graph-only'})`);
  }
  if (tasks.length > 12) console.log(`  ... and ${tasks.length - 12} more`);
} else {
  let humanEdited = 0;
  for (const t of tasks) {
    // Idempotency: never clobber a file the user hand-wrote (no AGENTS-GEN marker)
    if (existsSync(t.path)) {
      try {
        const existing = readFileSync(t.path, 'utf-8');
        if (!existing.includes(HEADER_MARKER)) {
          humanEdited++;
          console.log(`  ⏸  ${path.relative(REPO_ROOT, t.path)}  (human-edited, preserved)`);
          continue;
        }
      } catch { /* unreadable — overwrite */ }
    }
    mkdirSync(path.dirname(t.path), { recursive: true });
    writeFileSync(t.path, t.content, 'utf8');
    wrote++;

    // Mirror into Redis as agents:dir:<rel> for ACE quick-hit tool calls.
    // ACE context-assembler can fetch this in one round-trip alongside the
    // existing KAG note, getting pre-rendered audit-summarized markdown
    // instead of having to re-derive from the JSON-shaped wiki:note:dir:*.
    if (redis && t.label !== 'root') {
      try {
        const dirRel = t.label;
        await redis.setex(`agents:dir:${dirRel}`, 24 * 3600, t.content);
      } catch { /* non-fatal */ }
    } else if (redis && t.label === 'root') {
      try { await redis.setex('agents:root', 24 * 3600, t.content); } catch {}
    }
  }
  const mirrored = redis ? `, mirrored to Redis agents:dir:* (${wrote} keys, 24h TTL)` : '';
  console.log(`✓ wrote ${wrote} AGENTS.md file(s)${humanEdited ? `, preserved ${humanEdited} human-edited` : ''}${mirrored}`);
}

if (redis) await redis.quit();
