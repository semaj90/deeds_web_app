#!/usr/bin/env node
/**
 * enrich-agents-md.mjs
 *
 * Reads Redis ACE hits (code:graph:node:*, code:graph:hotspot:*),
 * maps the 55-gate audit system (Tiers A-H) to each directory,
 * injects an ## Audit Gates + ## TODO section into every AGENTS.md
 * ABOVE the <!-- AGENTS-GEN v1 --> auto-generated block,
 * and writes docs/TODO-enhancements.md as the master synthesis.
 *
 * Usage:
 *   node scripts/enrich-agents-md.mjs
 *   node scripts/enrich-agents-md.mjs --dry-run   # preview, no writes
 *   node scripts/enrich-agents-md.mjs --dir src/lib/server/ace  # single dir
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const SRC       = join(ROOT, 'src');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TARGET  = args.find(a => a.startsWith('--dir='))?.split('=')[1]
             ?? args[args.indexOf('--dir') + 1] ?? null;

// ── Gate catalogue ────────────────────────────────────────────────────────────
// Each gate: id, tier, short description, check command (bash-quoted)

const GATES = {
  // Tier A — Code Connectivity
  G1:  { tier:'A', desc:'Static ESM imports',       cmd:'rg "from.*MODULE" src/ --type ts --type svelte' },
  G2:  { tier:'A', desc:'Dynamic ESM imports',      cmd:'rg "import(.*MODULE" src/ --type ts --type svelte' },
  G5:  { tier:'A', desc:'Barrel re-exports',        cmd:'rg "export.*from.*MODULE" src/lib/ --type ts' },
  G7:  { tier:'A', desc:'fetch wiring',             cmd:'rg "fetch.*MODULE" src/ --type ts --type svelte' },
  G8:  { tier:'A', desc:'Custom event coupling',    cmd:'rg "CustomEvent.*MODULE" src/' },
  // Tier B — Data Layer
  G10: { tier:'B', desc:'Drizzle schema refs',      cmd:'rg "from.*schema-postgres" src/ --type ts -l' },
  G11: { tier:'B', desc:'DB client import (MUST be db/client not db/index)', cmd:'rg "from.*db/index" src/ --type ts  # expect 0 hits' },
  G12: { tier:'B', desc:'Vector/Qdrant collection coupling', cmd:'rg "collection.*MODULE" src/ --type ts' },
  // Tier C — Infrastructure
  G13: { tier:'C', desc:'Docker service ports (5432/6379/6333/9000/5672)', cmd:'rg "5432|6379|6333|9000|5672|50051" src/lib/server/ --type ts -l' },
  G14: { tier:'C', desc:'Native .node addon via createRequire', cmd:'rg "\\.node[\'\")] |createRequire" src/ --type ts -l' },
  G15: { tier:'C', desc:'Proto/gRPC contract consumers', cmd:'rg "proto|grpc|gRPC" src/lib/server/ --type ts -l' },
  G17: { tier:'C', desc:'No hardcoded localhost — use ENV.* getters', cmd:'rg "localhost|127\\.0\\.0\\.1" src/lib/server/ --type ts  # expect 0 outside env.server.ts' },
  // Tier D — Security + Runtime
  G18: { tier:'D', desc:'Auth guard on API routes',  cmd:'rg "locals\\.user|requireAuth|getSession" src/routes/api/MODULE/ --type ts' },
  G19: { tier:'D', desc:'Zod validation on API routes', cmd:'rg "import.*zod|from.*zod|z\\." src/routes/api/MODULE/ --type ts' },
  G20: { tier:'D', desc:'SSR safety — browser globals behind onMount guard', cmd:'rg "window\\.|document\\.|localStorage|IndexedDB" src/lib/MODULE --type svelte' },
  // Tier E — Svelte 5 Rune Compliance
  G21: { tier:'E', desc:'No Svelte 4 props (export let → $props())',       cmd:'rg "export\\s+let\\s+\\w+" src/ --glob "*.svelte"  # expect 0' },
  G22: { tier:'E', desc:'No Svelte 4 reactive ($: → $derived/$effect)',    cmd:'rg "^\\s*\\$:[^:]" src/ --glob "*.svelte"  # expect 0' },
  G23: { tier:'E', desc:'No Svelte 4 event directives (on:click → onclick)', cmd:'rg "\\bon:[a-z][a-z]+=" src/ --glob "*.svelte"  # expect 0' },
  G24: { tier:'E', desc:'No createEventDispatcher in live code',           cmd:'rg "createEventDispatcher\\(\\)" src/ --glob "*.svelte"  # expect 0' },
  G25: { tier:'E', desc:'No rune calls in plain .ts files',                cmd:'rg "\\$(?:state|derived|effect|props)\\s*[(<]" src/lib/ --type ts --glob "!*.svelte.ts" --glob "!*.d.ts"  # expect 0' },
  G26: { tier:'E', desc:'Route handler tests use @vitest-environment node + lazy import', cmd:'rg "^// @vitest-environment node" tests/routes/ --glob "*.test.ts" -l' },
  // Tier F — Contextual Graph (pytorch-graph N-API)
  G27: { tier:'F', desc:'kmeansWithCentroids AND trainSOM imported',       cmd:'rg "kmeansWithCentroids|trainSOM" src/lib/server/ --type ts -l  # ≥2 files' },
  G28: { tier:'F', desc:'SOM topology endpoint exists',                    cmd:'ls src/routes/api/graph/som-topology/+server.ts' },
  G29: { tier:'F', desc:'Colab export endpoint exists',                    cmd:'ls src/routes/api/graph/colab-export/+server.ts' },
  G31: { tier:'F', desc:'som_cluster payload written to Qdrant after SOM', cmd:'rg "som_cluster" src/lib/server/ --type ts' },
  G32: { tier:'F', desc:'SIMILAR_TOPOLOGY Neo4j relationship created',     cmd:'rg "SIMILAR_TOPOLOGY" src/lib/server/ --type ts' },
  G33: { tier:'F', desc:'pageRankGPU wired in graph module',               cmd:'rg "pageRankGPU" src/lib/server/graph/ --type ts' },
  G34: { tier:'F', desc:'attentionScoreGPU wired for ACE context weighting', cmd:'rg "attentionScoreGPU" src/lib/server/ --type ts -l' },
  G35: { tier:'F', desc:'rewardScoreGPU available for GRPO pipeline',      cmd:'rg "rewardScoreGPU" src/lib/server/ --type ts -l' },
  // Tier G — Glyph/Cartridge/ACE
  G36: { tier:'G', desc:'Shared GlyphRecord schema (semantic+vector+topology+render)', cmd:'rg "export interface GlyphRecord|type GlyphSection|type GlyphKind" src/lib/server/ --type ts' },
  G37: { tier:'G', desc:'RuneData → GlyphRecord compatibility mapper',     cmd:'rg "runeToGlyphRecord|GlyphRecord.*RuneData" src/lib/server/ --type ts' },
  G38: { tier:'G', desc:'Staged cartridge search (4D prefilter→attention→768d rerank)', cmd:'rg "topology prefilter|scoreAttention|rewardScoreGPU|searchCartridge.*Float32Array" src/lib/server/ --type ts' },
  G39: { tier:'G', desc:'Section-aware tiling (FACTS/LEGAL_AUTHORITY/CLAIMS/PRAYER_HOLDING)', cmd:'rg "FACTS|LEGAL_AUTHORITY|CLAIMS|PRAYER_HOLDING" src/lib/server/ --type ts' },
  G40: { tier:'G', desc:'Glyph prompt cache aligns to page boundaries',    cmd:'rg "glyphId|pageIndex|tileIndex|promptCacheKey|setFragment|getFragment" src/lib/server/ --type ts' },
  G41: { tier:'G', desc:'Tile atlas builder wired (not dormant)',          cmd:'rg "buildGlyphTileAtlas|searchGlyphTiles|invalidateGlyphAtlas|publishGlyphRebuild" src/ --type ts' },
  G42: { tier:'G', desc:'Redis slim/full atlas contract explicit',         cmd:'rg "centroid omitted from Redis|source: .redis.|searchGlyphTiles" src/lib/server/ --type ts' },
  G43: { tier:'G', desc:'CouchDB topology persistence',                    cmd:'rg "glyph_topology|COUCHDB_DB|_couchSave" src/lib/server/ --type ts' },
  G44: { tier:'G', desc:'RabbitMQ glyph rebuild trigger wired',            cmd:'rg "glyph.tile.rebuild" src/lib/server/ --type ts' },
  G45: { tier:'G', desc:'Drizzle schema stores glyph metadata',            cmd:'rg "glyph_records|grpoRewardScore|somCluster|centroidId" src/lib/server/db/ --type ts' },
  G46: { tier:'G', desc:'Barrel exports narrow and stable',                cmd:'rg "from .\\/glyph|from .\\/cartridge|export type .*Glyph" src/lib/server/ --type ts' },
  G47: { tier:'G', desc:'Frontend route coverage exists for cartridge+glyph', cmd:'rg "/api/cartridge/|/api/glyph/|glyph|cartridge" src/routes/ src/lib/ --type svelte' },
  // Tier H — Search Intelligence + Analytics
  G48: { tier:'H', desc:'Search Patterns API exports all 9 required fields', cmd:'rg "pipelineMemory|crossPipelineChamps|trending|didYouMean" src/routes/api/analytics/search-patterns/+server.ts' },
  G49: { tier:'H', desc:'search-analytics.ts exports 6 required read-side fns', cmd:'rg "export async function get" src/lib/server/analytics/search-analytics.ts  # ≥6 hits' },
  G50: { tier:'H', desc:'Chunk hit logging wired in context-assembler.ts', cmd:'rg "recordChunkHits" src/lib/server/ace/context-assembler.ts' },
  G51: { tier:'H', desc:'P1-A prompt leaderboard → ACE queryTags (feedback loop)', cmd:'rg "fetchTopQueryTags|getTopPrompts|topQueryTags" src/lib/server/ace/context-assembler.ts' },
  G52: { tier:'H', desc:'P3-A cross-source reranking active in context assembler', cmd:'rg "webSearchToUnified|webUnified|P3-A" src/lib/server/ace/context-assembler.ts' },
  G53: { tier:'H', desc:'ACE_PIPELINE_VERSION reflects post-P3-A state (≥2.x)', cmd:'rg "ACE_PIPELINE_VERSION = .2\\." src/lib/server/ace/context-assembler.ts' },
  G54: { tier:'H', desc:'P2-A generateCacheKey lives in cache-keys.ts only', cmd:'rg "export function generateCacheKey|export function generateContextHash" src/lib/server/cache-keys.ts' },
  G55: { tier:'H', desc:'redis-exact-match.ts and llm-cache.ts import from cache-keys', cmd:'rg "from.*cache-keys" src/lib/server/cache/redis-exact-match.ts src/lib/server/ai/llm-cache.ts  # 2 hits' },
  // GPU Layer Contract (from G8b)
  G8b: { tier:'A', desc:'GPU/Analysis layer — NO @sveltejs/kit imports (pure fns only)', cmd:'rg "from .@sveltejs/kit.|from .\\$app/" src/lib/server/gpu/ src/lib/server/analysis/ src/lib/server/vector/ --no-heading  # 0 hits' },
  // Layer contract (G8a)
  G8a: { tier:'A', desc:'Service layer — use HttpServiceError subclasses, not kit error()', cmd:'rg "import .*error.*from .@sveltejs/kit." src/lib/server/ --type ts  # 0 hits' },
};

// ── Directory → relevant gates mapping ───────────────────────────────────────
const DIR_GATE_MAP = [
  { pattern: /src\/lib\/server\/db/,          gates: ['G10','G11','G12','G13','G17'],            title: 'Data Layer (Drizzle + pgvector)' },
  { pattern: /src\/lib\/server\/vector/,       gates: ['G8b','G12','G17','G31','G32'],            title: 'Vector Store (Qdrant)' },
  { pattern: /src\/lib\/server\/gpu/,          gates: ['G8b','G14','G17','G27','G31','G32','G33','G34','G35'], title: 'GPU / N-API / LibTorch' },
  { pattern: /src\/lib\/server\/graph/,        gates: ['G8b','G27','G28','G29','G30','G31','G32','G33','G34','G35'], title: 'Graph Analytics (SOM / PageRank)' },
  { pattern: /src\/lib\/server\/ace/,          gates: ['G8a','G17','G36','G37','G38','G39','G40','G48','G49','G50','G51','G52','G53'], title: 'ACE Context Assembler + Glyph + Search Intelligence' },
  { pattern: /src\/lib\/server\/glyph/,        gates: ['G36','G37','G38','G39','G40','G41','G42','G43','G44','G45','G46','G47'], title: 'Glyph / Cartridge / ACE' },
  { pattern: /src\/lib\/server\/cartridge/,    gates: ['G36','G37','G38','G39','G40','G41','G42','G43','G44','G45','G46','G47'], title: 'Cartridge / Glyph Tiles' },
  { pattern: /src\/lib\/server\/analytics/,    gates: ['G8a','G17','G48','G49','G50','G51','G52','G53','G54','G55'], title: 'Search Intelligence + Analytics' },
  { pattern: /src\/lib\/server\/cache/,        gates: ['G17','G40','G42','G54','G55'],            title: 'Cache Layer' },
  { pattern: /src\/lib\/server\/ai/,           gates: ['G8a','G17','G18','G19','G26','G54','G55'], title: 'AI Service Layer' },
  { pattern: /src\/lib\/server\/grpc/,         gates: ['G8b','G13','G15','G17'],                  title: 'gRPC Infrastructure' },
  { pattern: /src\/lib\/server\/queue/,        gates: ['G13','G17'],                               title: 'Message Queue (RabbitMQ)' },
  { pattern: /src\/lib\/server\/middleware/,   gates: ['G8a','G17','G18','G20'],                   title: 'Middleware' },
  { pattern: /src\/lib\/server\/observability/,gates: ['G13','G15','G17'],                         title: 'Observability (Langfuse)' },
  { pattern: /src\/lib\/server\/retrieval/,    gates: ['G8a','G8b','G17','G31','G38'],             title: 'Retrieval Pipeline' },
  { pattern: /src\/lib\/server\/indexer/,      gates: ['G8a','G17','G31'],                         title: 'Indexer / Chunker' },
  { pattern: /src\/lib\/server\/inference/,    gates: ['G8a','G17','G33','G34'],                   title: 'Inference Router' },
  { pattern: /src\/lib\/server$/,              gates: ['G1','G8a','G10','G11','G13','G17'],        title: 'Server Root' },
  { pattern: /src\/mcp/,                       gates: ['G1','G2','G8a','G18','G19'],               title: 'MCP Tool Surface (TRACE)' },
  { pattern: /src\/routes\/api/,               gates: ['G18','G19','G20','G26'],                   title: 'API Routes' },
  { pattern: /src\/lib\/components/,           gates: ['G21','G22','G23','G24','G25','G20'],       title: 'Svelte 5 Components' },
  { pattern: /src\/lib\/stores/,               gates: ['G21','G22','G25'],                         title: 'Svelte Stores' },
  { pattern: /src\/lib\/ai/,                   gates: ['G1','G17','G20','G25'],                    title: 'Client AI (ONNX / routing)' },
  { pattern: /src\/lib\/types/,                gates: ['G1','G25'],                                title: 'Shared Types' },
  { pattern: /src\/lib\/services/,             gates: ['G1','G8a','G17'],                          title: 'Services' },
  { pattern: /src\/lib\/server\/types/,        gates: ['G1','G10','G36'],                          title: 'Server Types' },
];

function gatesForDir(relDir) {
  for (const { pattern, gates, title } of DIR_GATE_MAP) {
    if (pattern.test(relDir)) return { gates, title };
  }
  return { gates: ['G1','G2','G17'], title: 'General' };
}

// ── Redis read ─────────────────────────────────────────────────────────────────
async function loadRedisData() {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); } catch { return { nodes: [], hotspots: [] }; }
  const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { lazyConnect: true, connectTimeout: 4_000 });
  try {
    await r.connect();
    const nodeKeys = await r.keys('code:graph:node:*');
    const hotKeys  = await r.keys('code:graph:hotspot:*');

    const readAll = async (keys) => {
      const out = [];
      for (let i = 0; i < keys.length; i += 500) {
        const pipe = r.pipeline();
        for (const k of keys.slice(i, i+500)) pipe.get(k);
        const res = await pipe.exec();
        out.push(...res.map(([,v]) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean));
      }
      return out;
    };

    const nodes    = await readAll(nodeKeys);
    const hotspots = await readAll(hotKeys);
    await r.quit().catch(() => {});
    return { nodes, hotspots };
  } catch { await r.quit().catch(() => {}); return { nodes: [], hotspots: [] }; }
}

// ── Build directory stats ─────────────────────────────────────────────────────
function buildDirStats(nodes, hotspots) {
  const stats = new Map(); // relDir → { files, maxFanIn, hotspotFiles }
  for (const node of nodes) {
    const parts = node.file_path.split('/');
    parts.pop();
    const dir = parts.join('/');
    if (!stats.has(dir)) stats.set(dir, { files: [], maxFanIn: 0, hotspotFiles: [] });
    const d = stats.get(dir);
    d.files.push({ file: node.file_path, fanIn: node.directFanIn||0, fanOut: node.directFanOut||0, zone: node.zone });
    d.maxFanIn = Math.max(d.maxFanIn, node.directFanIn||0);
  }
  for (const h of hotspots) {
    const parts = h.file_path.split('/');
    parts.pop();
    const dir = parts.join('/');
    if (stats.has(dir)) {
      stats.get(dir).hotspotFiles.push({ file: h.file_path, fanIn: h.directFanIn, topCallers: h.topCallers || [] });
    }
  }
  return stats;
}

// ── Find all AGENTS.md files ─────────────────────────────────────────────────
function findAgentsMd(root) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'deeds_labs') {
        walk(join(dir, e.name));
      } else if (e.isFile() && e.name === 'AGENTS.md') {
        results.push(join(dir, e.name));
      }
    }
  }
  walk(root);
  return results;
}

// ── Generate audit gate section ───────────────────────────────────────────────
function buildGateSection(relDir, dirStats) {
  const { gates, title } = gatesForDir(relDir);
  const stats = dirStats.get(relDir);
  const now   = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push(`## Audit Gates — ${title}`);
  lines.push('');
  lines.push(`> Auto-mapped from CLAUDE.md §"Unified Audit Gate System". Last enriched: ${now}`);
  lines.push('> Run each check from the **sveltekit-frontend/** root.');
  lines.push('');

  // Group by tier
  const byTier = {};
  for (const gid of gates) {
    const g = GATES[gid];
    if (!g) continue;
    if (!byTier[g.tier]) byTier[g.tier] = [];
    byTier[g.tier].push({ gid, ...g });
  }

  const tierLabels = {
    A: 'Tier A — Code Connectivity',
    B: 'Tier B — Data Layer',
    C: 'Tier C — Infrastructure',
    D: 'Tier D — Security + Runtime',
    E: 'Tier E — Svelte 5 Rune Compliance',
    F: 'Tier F — Contextual Graph (pytorch-graph)',
    G: 'Tier G — Glyph / Cartridge / ACE',
    H: 'Tier H — Search Intelligence + Analytics',
  };

  for (const [tier, gateList] of Object.entries(byTier).sort()) {
    lines.push(`### ${tierLabels[tier] ?? `Tier ${tier}`}`);
    lines.push('');
    for (const { gid, desc, cmd } of gateList) {
      lines.push(`**${gid}** ${desc}`);
      lines.push('```bash');
      lines.push(cmd);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Generate TODO section ─────────────────────────────────────────────────────
function buildTodoSection(relDir, dirStats) {
  const stats = dirStats.get(relDir);
  if (!stats) return '';

  const todos = [];
  const { gates } = gatesForDir(relDir);

  // High fan-in files lacking tests
  const untested = stats.files.filter(f => f.fanIn >= 10 && !f.file.includes('.test.') && !f.file.includes('.spec.'));
  for (const u of untested.sort((a,b) => b.fanIn - a.fanIn).slice(0, 5)) {
    todos.push(`- [ ] **test-coverage** \`${u.file}\` fanIn=${u.fanIn} — add G26-pattern test (${u.fanIn} consumers depend on this)`);
  }

  // Hotspot warnings
  for (const h of stats.hotspotFiles.slice(0, 3)) {
    todos.push(`- [ ] **hotspot** \`${h.file}\` (fanIn=${h.fanIn}) — consider splitting or adding circuit breaker; top callers: ${h.topCallers.slice(0,3).map(c => '`' + c.split('/').pop() + '`').join(', ')}`);
  }

  // Gate-specific TODOs based on which gates are mapped
  if (gates.includes('G17')) {
    todos.push('- [ ] **G17** Audit for remaining hardcoded `localhost` / `127.0.0.1` — replace with `ENV.*` getters');
  }
  if (gates.includes('G8b') && relDir.includes('gpu')) {
    todos.push('- [ ] **G8b** Confirm no `@sveltejs/kit` imports exist in this directory (GPU layer must be framework-agnostic)');
  }
  if (gates.includes('G8a')) {
    todos.push('- [ ] **G8a** Use `HttpServiceError` subclasses (`UnauthorizedError`, `NotFoundError`, etc.) — never `throw error()` from `@sveltejs/kit` in service layer');
  }
  if (gates.includes('G26') && relDir.includes('routes/api')) {
    todos.push('- [ ] **G26** Every `+server.ts` in this directory needs a paired test in `tests/routes/` with `@vitest-environment node` + lazy import pattern');
  }
  if (gates.includes('G50') && relDir.includes('ace')) {
    todos.push('- [ ] **G50** Verify `recordChunkHits()` fires on EVERY ACE retrieval pass (not just RAG — also ACP, KAG, graph)');
  }
  if (gates.includes('G53') && relDir.includes('ace')) {
    todos.push('- [ ] **G53** Bump `ACE_PIPELINE_VERSION` to ≥ 2.x after any pipeline shape change to invalidate stale `ace_chunks` cache rows');
  }
  if (gates.includes('G54') || gates.includes('G55')) {
    todos.push('- [ ] **G54/G55** All cache key generation must import from `cache-keys.ts` — no local `generateCacheKey` copies');
  }
  if (gates.includes('G27') && (relDir.includes('gpu') || relDir.includes('graph'))) {
    todos.push('- [ ] **G27** Verify addon exports: `node -e "const a=require(\'./simd-bridge/cpp/build/Release/tensorrt_bridge.node\'); [\'kmeansWithCentroids\',\'trainSOM\',\'pageRankGPU\',\'attentionScoreGPU\',\'rewardScoreGPU\'].forEach(f=>console.log(f,typeof a[f]))"` — all must be \'function\'');
  }

  if (todos.length === 0) return '';

  return [
    '## TODO — Enhancements from ACE Analysis',
    '',
    '> Generated from Redis ACE hits (code:graph:node:* + hotspot data). Regenerate: `node scripts/enrich-agents-md.mjs`.',
    '',
    ...todos,
    '',
  ].join('\n');
}

// ── Master TODO synthesis ─────────────────────────────────────────────────────
function buildMasterTodo(dirStats, hotspots, totalNodes) {
  const lines = [];
  const ts = new Date().toISOString().slice(0, 19) + 'Z';
  lines.push('# TODO — Codebase Enhancement Synthesis');
  lines.push('');
  lines.push(`> Generated: ${ts} from ${dirStats.size} directories, ${hotspots.length} hotspot files`);
  lines.push('> Source: Redis ACE hits (code:graph:node:* + code:graph:hotspot:*) + 55-gate audit system');
  lines.push('');

  // ── Data freshness warning ────────────────────────────────────────────────
  const FULL_GRAPH_TARGET = 3000;  // expected node count after graphify:full
  if (totalNodes < FULL_GRAPH_TARGET) {
    lines.push('> ⚠️ **Data stale** — Redis has only ' + totalNodes + ' node entries (expect ≥' + FULL_GRAPH_TARGET + ' after `graphify:full`). Sections 1 and 2 below may be sparse or empty.');
    lines.push('> Run: `npm run graphify:full && npm run agents:enrich` to repopulate (5-10 min GPU).');
    lines.push('');
    lines.push('- [ ] **data:refresh** `npm run graphify:full && npm run agents:enrich` — last enriched ' + ts + ' with ' + totalNodes + ' nodes / ' + hotspots.length + ' hotspots (full graph has ≥' + FULL_GRAPH_TARGET + ' files)');
    lines.push('');
  }

  // ── Section 1: Critical Hotspots ──────────────────────────────────────────
  lines.push('## 1. Critical Hotspots (High Fan-In → High Risk)');
  lines.push('');
  lines.push('Files with the most dependents — changes here cascade widely. Each needs:');
  lines.push('1. Paired test (G26), 2. Circuit-breaker / dependency inversion assessment');
  lines.push('');
  lines.push('| File | Fan-In | Zone | Action |');
  lines.push('|------|--------|------|--------|');
  const ranked = hotspots.sort((a,b) => b.directFanIn - a.directFanIn);
  for (const h of ranked) {
    const action = h.directFanIn > 200
      ? '⚠️ CRITICAL — consider dependency inversion + interface extraction'
      : h.directFanIn > 50
      ? '🟠 HIGH — add paired test + change guard'
      : '🟡 MODERATE — add paired test';
    lines.push(`| \`${h.file_path}\` | ${h.directFanIn} | ${h.zone} | ${action} |`);
  }
  lines.push('');

  // ── Section 2: Test Coverage Gaps ────────────────────────────────────────
  lines.push('## 2. Test Coverage Gaps (fanIn ≥ 15, no paired test)');
  lines.push('');
  lines.push('> G26 compliance: every high-fanIn server file needs a test in `tests/routes/auto/`');
  lines.push('> Pattern: `@vitest-environment node` + `vi.hoisted` + lazy `beforeEach` import + 401/400/200/degraded cases');
  lines.push('');

  const untested = [];
  for (const [dir, s] of dirStats.entries()) {
    for (const f of s.files) {
      if (f.fanIn >= 15 && !f.file.includes('.test.') && !f.file.includes('.spec.') && !f.file.includes('/tests/') && (f.zone === 'server' || f.zone === 'route')) {
        untested.push(f);
      }
    }
  }
  untested.sort((a,b) => b.fanIn - a.fanIn);
  for (const f of untested.slice(0, 30)) {
    lines.push(`- [ ] \`${f.file}\` (fanIn=${f.fanIn})`);
  }
  lines.push('');

  // ── Section 3: Audit Gate Failures by Tier ────────────────────────────────
  lines.push('## 3. Audit Gate Violations to Address');
  lines.push('');

  lines.push('### G17 — Hardcoded localhost refs (must use ENV.* getters)');
  lines.push('Run: `rg "localhost|127\\.0\\.0\\.1" src/lib/server/ --type ts --glob "!env.server.ts"` — all hits are violations');
  lines.push('');

  lines.push('### G8a — SvelteKit error() in service layer');
  lines.push('Run: `rg "import .*error.*from .@sveltejs/kit." src/lib/server/ --type ts` — all hits are violations');
  lines.push('Use `HttpServiceError` subclasses from `$lib/server/errors.ts` instead');
  lines.push('');

  lines.push('### G8b — GPU/Analysis layer importing SvelteKit');
  lines.push('Run: `rg "from .@sveltejs/kit.|from .\\$app/" src/lib/server/gpu/ src/lib/server/analysis/ src/lib/server/vector/` — must be 0');
  lines.push('');

  lines.push('### G11 — Wrong DB client import');
  lines.push('Run: `rg "from.*db/index" src/ --type ts` — must be 0 (use `db/client` for node-postgres Pool)');
  lines.push('');

  lines.push('### G21-G24 — Svelte 4 patterns in .svelte files');
  lines.push('Run: `rg "export\\s+let|^\\s*\\$:[^:]|\\bon:[a-z]|createEventDispatcher" src/ --glob "*.svelte"` — must be 0');
  lines.push('');

  // ── Section 4: Context Enhancement Opportunities ──────────────────────────
  lines.push('## 4. Context Enhancement Opportunities (ACE Pipeline)');
  lines.push('');

  lines.push('### G50 — chunk hit logging coverage');
  lines.push('`recordChunkHits()` must fire for EVERY retrieval pass: RAG (Qdrant), ACP cross-feed, KAG notes, SOM/hypergraph, PageRank. Currently fires on RAG pass; verify ACP + graph passes are also logged.');
  lines.push('');

  lines.push('### G51 — P1-A prompt leaderboard feedback loop');
  lines.push('`fetchTopQueryTags()` in context-assembler injects top prompts into `ACEContext.queryTags`. Verify the write path (prompt clicks → `typing:prompt:clicks` Redis sorted set) and read path (leaderboard API → ACE) are both live.');
  lines.push('');

  lines.push('### G52 — P3-A cross-source reranking');
  lines.push('`webSearchToUnified()` in context-assembler merges web search results into RAG chunks before reranking. Verify it handles empty web results gracefully (no crash when `BRAVE_API_KEY` absent).');
  lines.push('');

  lines.push('### G53 — ACE_PIPELINE_VERSION');
  lines.push('After any shape change to ACEContext or the retrieval trace, bump `ACE_PIPELINE_VERSION` constant so the ACE chunk cache (Redis `ace_chunks:*` keys) auto-invalidates rather than serving stale context.');
  lines.push('');

  lines.push('### G54/G55 — Cache key consolidation (P2-A)');
  lines.push('Single source of truth for LLM cache key generation: `cache-keys.ts`. Both `redis-exact-match.ts` and `llm-cache.ts` must import from there. Check for any remaining local `generateCacheKey` implementations.');
  lines.push('');

  // ── Section 5: GraphRAG community layer ──────────────────────────────────
  lines.push('## 5. GraphRAG / ACE Graph Enhancement');
  lines.push('');

  lines.push('### G27-G35 — pytorch-graph N-API wiring');
  lines.push('Verify all 5 GPU functions are exported from the addon:');
  lines.push('```bash');
  lines.push('node -e "const a=require(\'./simd-bridge/cpp/build/Release/tensorrt_bridge.node\'); [\'kmeansWithCentroids\',\'trainSOM\',\'pageRankGPU\',\'attentionScoreGPU\',\'rewardScoreGPU\'].forEach(f=>console.log(f+\':\',typeof a[f]))"');
  lines.push('```');
  lines.push('');

  lines.push('### Topo-byte cache TTL tuning');
  lines.push('`ace:topo:{topoClass}:{queryHash}` TTL is 300s. For frequently-queried topology classes, consider bumping to 600s to reduce ANN calls without staleness risk (topology graph changes at most once per `graphify:full` run).');
  lines.push('');

  lines.push('### SOM + PageRank freshness');
  lines.push('`codebase_chunks_768` Qdrant payload field `som_cluster` and Neo4j `SIMILAR_TOPOLOGY` edges are written by `run-hypergraph.ts`. If `graphify:full` has not run recently, these are stale — ACE topological boosting underperforms.');
  lines.push('Run: `npm run graphify:full` to refresh (5-10 min GPU).');
  lines.push('');

  // ── Section 6: Structural Enhancement Backlog ──────────────────────────────
  lines.push('## 6. Structural Enhancement Backlog');
  lines.push('');

  lines.push('### Dependency Inversion — db/client.ts (484 importers)');
  lines.push('`src/lib/server/db/client.ts` is the #1 hotspot with 484 dependents. Consider:');
  lines.push('- Wrapping behind a thin `getDb()` function (already partially done via `db` export)');
  lines.push('- Creating domain-specific query modules to reduce direct cross-domain imports');
  lines.push('- Tracking which query patterns are most common (analytics → targeted optimization)');
  lines.push('');

  lines.push('### env.server.ts (336 importers)');
  lines.push('Only `env.server.ts` should read `process.env.*` directly. The 336 importers are expected but confirm none bypass it with raw `process.env.*` access.');
  lines.push('Run: `rg "process\\.env\\." src/ --type ts --glob "!env.server.ts"` — expect 0 outside of script files');
  lines.push('');

  lines.push('### redis.ts (237 importers)');
  lines.push('237 files import directly from `redis.ts`. The `getRedis()` pool pattern (18 migrated 2026-04-12) should cover all of them. Verify no file still uses `new Redis(...)` directly.');
  lines.push('Run: `rg "new Redis(" src/lib/server/ --type ts --glob "!redis.ts"` — expect 0');
  lines.push('');

  lines.push('### gRPC port collision — port 50055');
  lines.push('Both `chr97-agent-client.ts` and `go-search-service` claim port 50055. One must move to 50058+ before enabling both services. See CLAUDE.md §"gRPC Service Port Map".');
  lines.push('');

  lines.push('### Phase B LLM Summaries — still pending');
  lines.push('`npm run graphify:summarize` (Phase B of the deep-import pipeline) was blocked by Ollama VRAM (gemma4-legal-vlm occupying all slots).');
  lines.push('Run when VRAM is free: `npm run graphify:summarize:limit` (first 50 files with gemma3:270m)');
  lines.push('This will populate `memory/graphify/deep/summaries/` and `memory/ingest/pending/graphify_summaries_*.jsonl`');
  lines.push('');

  // ── Section 7: Quick wins (<30 min each) ─────────────────────────────────
  lines.push('## 7. Quick Wins (<30 min each)');
  lines.push('');
  lines.push('- [ ] Run `npm run audit:test-stubs` to generate G26-pattern placeholder tests for all unmapped POST/PUT/PATCH/DELETE routes');
  lines.push('- [ ] Run `rg "new Redis(" src/lib/server/ --type ts` — fix any remaining direct Redis construction outside `redis.ts`');
  lines.push('- [ ] Run `rg "from.*db/index" src/ --type ts` — fix any remaining wrong DB client imports');
  lines.push('- [ ] Run `npm run typecheck:native` (tsgo) — fast type audit that catches TS2345 mismatches missed by svelte-check');
  lines.push('- [ ] Set `RETRIEVAL_HTTP_ENABLED=true` in `.env` and test Go retrieval HTTP path (port 8100) — middle tier between gRPC and inline fallback');
  lines.push('- [ ] Verify `GRAPH_ML_GRPC_URL` is defined in `.env` (flagged as MISSING ENV in gRPC audit)');
  lines.push('- [ ] Run `npm run graphify:full` to refresh SOM + PageRank + Neo4j topology edges (stale since last indexing run)');
  lines.push('');

  return lines.join('\n');
}

// ── Fix timeline via git log ──────────────────────────────────────────────────
// Returns last N commits that touched files under `relDir`, formatted as a
// markdown table with ISO timestamp, hash, and subject — so agents can see the
// error-fixing history of this directory at a glance.
function buildFixTimeline(relDir, limit = 6) {
  // git log --format="%H|%ai|%s" -- <relDir>/**
  const result = spawnSync(
    'git',
    ['log', `--max-count=${limit}`, '--format=%h|%ai|%s', '--', `${relDir}/`],
    { cwd: ROOT, encoding: 'utf8', timeout: 5000 }
  );
  if (result.status !== 0 || !result.stdout?.trim()) return '';

  const rows = result.stdout.trim().split('\n').map(line => {
    const [hash, ts, ...rest] = line.split('|');
    const subject = rest.join('|').trim();
    const isoDate = ts ? ts.slice(0, 16).replace(' ', 'T') : '';
    return `| \`${hash}\` | ${isoDate} | ${subject} |`;
  }).filter(Boolean);

  if (rows.length === 0) return '';

  return [
    '## Fix Timeline',
    '',
    '> Recent commits touching this directory — newest first. Used by agents to correlate errors with fixes.',
    '',
    '| Commit | Timestamp | Subject |',
    '|--------|-----------|---------|',
    ...rows,
    '',
  ].join('\n');
}

// ── Enrich a single AGENTS.md ─────────────────────────────────────────────────
const GEN_MARKER = '<!-- AGENTS-GEN v1';
const ENRICH_START = '<!-- AGENTS-ENRICH v1 · auto-generated by enrich-agents-md.mjs · do not edit manually -->';
const ENRICH_END   = '<!-- /AGENTS-ENRICH -->';

function enrichFile(agentsMdPath, dirStats) {
  const absDir  = dirname(agentsMdPath);
  const relDir  = relative(ROOT, absDir).replace(/\\/g, '/');

  if (TARGET && !relDir.startsWith(TARGET)) return false;

  const current = readFileSync(agentsMdPath, 'utf8');

  // Strip existing enrichment block
  let base = current;
  const enrichStart = base.indexOf(ENRICH_START);
  const enrichEndIdx = base.indexOf(ENRICH_END);
  if (enrichStart !== -1 && enrichEndIdx !== -1) {
    base = base.slice(0, enrichStart) + base.slice(enrichEndIdx + ENRICH_END.length);
  }

  // Build new enrichment block
  const gateSection    = buildGateSection(relDir, dirStats);
  const todoSection    = buildTodoSection(relDir, dirStats);
  const timelineSection = buildFixTimeline(relDir);

  const enrichBlock = [
    ENRICH_START,
    '',
    gateSection,
    '',
    todoSection,
    timelineSection,
    ENRICH_END,
    '',
  ].join('\n');

  // Insert before AGENTS-GEN marker (or append if marker absent)
  let newContent;
  const genIdx = base.indexOf(GEN_MARKER);
  if (genIdx !== -1) {
    newContent = base.slice(0, genIdx) + enrichBlock + '\n' + base.slice(genIdx);
  } else {
    newContent = base.trimEnd() + '\n\n' + enrichBlock + '\n';
  }

  if (newContent === current) return false;
  if (!DRY_RUN) writeFileSync(agentsMdPath, newContent, 'utf8');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log(`\n[enrich-agents-md] Loading Redis ACE hits …`);
const { nodes, hotspots } = await loadRedisData();
console.log(`  nodes=${nodes.length}  hotspots=${hotspots.length}`);

const dirStats = buildDirStats(nodes, hotspots);
console.log(`  directories mapped: ${dirStats.size}`);

console.log(`\n[enrich-agents-md] Finding AGENTS.md files …`);
const agentsMdFiles = findAgentsMd(SRC);
console.log(`  found: ${agentsMdFiles.length}`);

console.log(`\n[enrich-agents-md] Enriching … ${DRY_RUN ? '(dry-run)' : ''}`);
let updated = 0;
for (const f of agentsMdFiles) {
  const changed = enrichFile(f, dirStats);
  if (changed) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    console.log(`  ✓ ${rel}`);
    updated++;
  }
}
console.log(`  updated: ${updated} / ${agentsMdFiles.length}`);

// ── Write master TODO ─────────────────────────────────────────────────────────
const todoPath = join(ROOT, 'docs', 'TODO-enhancements.md');
mkdirSync(dirname(todoPath), { recursive: true });
const masterTodo = buildMasterTodo(dirStats, hotspots, nodes.length);
if (!DRY_RUN) {
  writeFileSync(todoPath, masterTodo, 'utf8');
  console.log(`\n  ✓ Wrote docs/TODO-enhancements.md (${masterTodo.length.toLocaleString()} chars)`);
} else {
  console.log(`\n  [dry-run] Would write docs/TODO-enhancements.md (${masterTodo.length.toLocaleString()} chars)`);
}

console.log(`\n[enrich-agents-md] Done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log('══════════════════════════════════════════\n');
