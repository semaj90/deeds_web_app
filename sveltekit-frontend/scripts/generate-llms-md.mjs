#!/usr/bin/env node
/**
 * generate-llms-md.mjs
 *
 * Emits LLMS.md per directory by joining:
 *   - Redis KAG notes      (wiki:note:dir:*)   — purpose, summary, audit, neighbors
 *   - Graph JSON           (docs/graph/codebase-graph.json) — per-file gate flags
 *
 * Implements the llms.md convention:
 *   - Plain Markdown, no frontmatter required
 *   - Per-directory files; agents walk up the tree from the file under work
 *   - Subdirectory files ADD context (don't replace root)
 *
 * Output:
 *   LLMS.md                                — root (repo overview + audit dashboard)
 *   sveltekit-frontend/LLMS.md             — frontend overview
 *   sveltekit-frontend/src/routes/.../LLMS.md       — per-route-dir context
 *   sveltekit-frontend/src/lib/server/.../LLMS.md   — per-server-module context
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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

// Stable marker for human-edit detection
const HEADER_MARKER = '<!-- LLMS-GEN v1 · do not edit below this line -->';
const STAMP = `${HEADER_MARKER}\n<!-- generated: ${new Date().toISOString()} · llms.md spec · regen: npm run llms:write -->`;

const WORKSPACE_EXTENSIONS = new Set(['.ts', '.svelte', '.js', '.mjs', '.cjs', '.json', '.md', '.go', '.cpp', '.cc', '.h', '.hpp', '.rs', '.proto', '.sql']);
const WORKSPACE_EXCLUDE_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', '__mocks__', '__tests__', 'deeds_labs', '.venv', '.svelte-error-fixes-backup', 'archive']);

// ── Connect to Redis ─────────────────────────────────────────────────────────
let redis = null;
try {
  const { default: Redis } = await import('ioredis');
  const candidate = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   true,
    connectTimeout:       2000,
    retryStrategy:        () => null,
  });
  candidate.on('error', () => {});
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

// ── Group files by directory ─────────────────────────────────────────────────
const dirMap = new Map();
for (const f of files) {
  const dir = path.dirname(f.rel);
  if (!dirMap.has(dir)) dirMap.set(dir, []);
  dirMap.get(dir).push(f);
}

function renderWorkspaceMap() {
  const rows = [];
  try {
    for (const entry of readdirSync(REPO_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (WORKSPACE_EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      const full = path.join(REPO_ROOT, entry.name);
      rows.push({
        name: entry.name,
        llms: existsSync(path.join(full, 'LLMS.md')) ? 'yes' : 'no',
        note: entry.name === 'sveltekit-frontend' ? 'current main subtree' : '',
      });
    }
  } catch {}

  return `## Workspace path map

| Top-level dir | LLMS.md | Notes |
|--------------|-----------|-------|
${rows.map(r => `| \`${r.name}\` | ${r.llms} | ${r.note} |`).join('\n')}
`;
}

// ── Render per-directory LLMS.md ─────────────────────────────────────────────
function renderDirLLMS(dirRel, dirFiles, kagDoc) {
  const m = {
    fileCount: dirFiles.length,
    apiCount: dirFiles.filter(f => f.routeHandlers?.length > 0).length,
  };
  
  const purpose = kagDoc?.purpose ?? `Directory: ${dirRel}`;
  const summary = kagDoc?.summary ?? `${m.fileCount} file(s), ${m.apiCount} handler(s)`;
  const fileList = dirFiles.slice(0, 10).map(f => `- \`${path.basename(f.rel)}\``).join('\n');

  return `# LLMS.md — \`${dirRel}\`

${STAMP}

> ${purpose}

## Snapshot

- ${summary}
- Files: ${m.fileCount}

## Top Files

${fileList}

## Agentic tool-calling — quick ACE hits

- \`read_file({ filePath: "${dirRel}/<file>" })\`
- \`verify_fix({ filePath: "${dirRel}/+server.ts" })\`

## How to use this file

Agents automatically pick up the nearest \`LLMS.md\` when editing. The root \`LLMS.md\` provides repo-wide rules.

Run \`npm run llms:write\` to regenerate.
`;
}

// ── Render root LLMS.md ──────────────────────────────────────────────────────
function renderRootLLMS() {
  return `# LLMS.md — Deeds Web App

${STAMP}

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2 + UnoCSS + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> See [\`CLAUDE.md\`](./CLAUDE.md) for the canonical dev guide.

${renderWorkspaceMap()}

## Critical conventions

- **Svelte 5 runes only**.
- **Auth on API routes** — required for all non-public endpoints.
- **Zod on body-parsing routes** — always validate inputs.

## How LLMS.md works here

- **Discovery**: nearest \`LLMS.md\` walking up from the file wins.
- **Hierarchical**: subdirectory files ADD context.

Run \`npm run llms:write\` to regenerate.
`;
}

// ── Write loop ───────────────────────────────────────────────────────────────
const root = renderRootLLMS();
const tasks = [];

tasks.push({ path: path.join(REPO_ROOT, 'LLMS.md'), content: root });

if (!ROOT_ONLY) {
  for (const [dirRel, dirFiles] of dirMap.entries()) {
    if (dirFiles.length < MIN_FILES) continue;
    if (FILTER && !dirRel.includes(FILTER)) continue;

    const kagDoc = await rget(`wiki:note:dir:${dirRel.replace(/[^a-z0-9]/gi, '_')}`);
    const md = renderDirLLMS(dirRel, dirFiles, kagDoc);
    tasks.push({ path: path.join(REPO_ROOT, dirRel, 'LLMS.md'), content: md });
  }
}

console.log(`📋 ${tasks.length} LLMS.md target(s)`);

if (DRY_RUN) {
  tasks.slice(0, 5).forEach(t => console.log(`[dry] ${t.path}`));
} else {
  for (const t of tasks) {
    // Hierarchical / Caveman preservation logic
    if (existsSync(t.path)) {
      const existing = readFileSync(t.path, 'utf8');
      if (!existing.includes(HEADER_MARKER)) {
        console.log(`  ⏸  ${path.relative(REPO_ROOT, t.path)}  (preserved)`);
        continue;
      }
      
      // Preserve everything ABOVE the marker
      const genIdx = existing.indexOf(HEADER_MARKER);
      if (genIdx > 0) {
        const prefix = existing.slice(0, genIdx).trim();
        if (prefix) {
          const h1Line = t.content.split('\n')[0];
          const rest = t.content.slice(h1Line.length).trim();
          t.content = `${h1Line}\n\n${prefix}\n\n${rest}`;
        }
      }
    }
    
    mkdirSync(path.dirname(t.path), { recursive: true });
    writeFileSync(t.path, t.content, 'utf8');
  }
}
