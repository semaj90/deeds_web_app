#!/usr/bin/env node
/**
 * build-function-registry.mjs
 *
 * Scans the key layers of the deeds-web-app codebase and emits:
 *   docs/atlas/function-registry.md       — human-readable lane catalogue
 *   docs/atlas/lane-to-function-map.json  — machine-readable per-file entries
 *
 * Run:
 *   node scripts/atlas/build-function-registry.mjs
 *   node scripts/atlas/build-function-registry.mjs --verbose
 *   node scripts/atlas/build-function-registry.mjs --dry-run
 *
 * Anti-duplication contract:
 *   Before creating a new file or function, search lane-to-function-map.json.
 *   If an entry already covers ≥60% of the job, REUSE it.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '../..');   // sveltekit-frontend/
const REPO_ROOT = join(ROOT, '..');           // deeds-web-app/
const VERBOSE   = process.argv.includes('--verbose');
const DRY_RUN   = process.argv.includes('--dry-run');
const OUT_DIR   = join(ROOT, 'docs', 'atlas');

// ── Recursive File Scanner Helper ─────────────────────────────────────────────

function getFilesRecursive(dir, fileList = []) {
  if (!existsSync(dir)) return fileList;
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return fileList;
  }
  for (const file of files) {
    const absPath = join(dir, file);
    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.svelte-kit' && file !== 'dist' && file !== 'build' && file !== '.git') {
        getFilesRecursive(absPath, fileList);
      }
    } else {
      fileList.push(absPath);
    }
  }
  return fileList;
}

// ── Layer definitions ─────────────────────────────────────────────────────────

const LAYERS = [
  {
    id:          'PACKET_LAYER',
    label:       'Packet Layer',
    domain:      'packet_identity',
    ontology:    'parent_atlas_packet',
    topology:    'packet_store',
    scanDirs:    [
      'scripts/atlas',
      'sveltekit-frontend/scripts/atlas',
      'packages/parent-atlas',
      'sveltekit-frontend/src/lib/server/ace',
      'sveltekit-frontend/src/lib/server/db/schema',
    ],
    filePatterns: [
      /packet/i, /neschrom/i, /nes.chrom/i, /ace.packet/i, /ldjson/i, /materializ/i,
    ],
  },
  {
    id:          'RETRIEVAL_LAYER',
    label:       'Retrieval Layer',
    domain:      'retrieval_pipeline',
    ontology:    'hyperrag_fusion',
    topology:    'core_search_entrypoint',
    scanDirs:    [
      'sveltekit-frontend/src/lib/server/retrieval',
      'sveltekit-frontend/src/lib/agent/tools',
    ],
    filePatterns: [
      /hyperrag/i, /retrieval/i, /rrf/i, /bm25/i, /neo4j/i, /topolog/i, /turbovec/i,
      /prefilter/i, /reranker/i, /fusion/i, /search/i, /query.router/i,
    ],
  },
  {
    id:          'GRAPH_TOPOLOGY_LAYER',
    label:       'Graph Topology Layer',
    domain:      'graph_topology',
    ontology:    'neo4j_gds',
    topology:    'graph_index',
    scanDirs:    [
      'scripts/atlas',
      'sveltekit-frontend/scripts/atlas',
      'scripts/graph',
      'sveltekit-frontend/scripts/graph',
    ],
    filePatterns: [
      /neo4j/i, /gds/i, /sync.gds/i, /backfill.topology/i, /seed.neo4j/i,
      /pagerank/i, /community/i, /centrality/i, /used.concept/i,
    ],
  },
  {
    id:          'QDRANT_LAYER',
    label:       'Qdrant Layer',
    domain:      'vector_store',
    ontology:    'qdrant_mirror',
    topology:    'cache_mirror',
    scanDirs:    [
      'scripts/atlas',
      'sveltekit-frontend/scripts/atlas',
      'sveltekit-frontend/src/lib/server/retrieval',
    ],
    filePatterns: [
      /qdrant/i, /vector/i, /payload.tag/i, /mirror/i, /reconcil/i, /verify.qdrant/i,
    ],
  },
  {
    id:          'SOM_CLUSTER_LAYER',
    label:       'SOM / Cluster Layer',
    domain:      'som_clustering',
    ontology:    'som_cluster',
    topology:    'cluster_node',
    scanDirs:    [
      'scripts/atlas',
      'sveltekit-frontend/scripts/atlas',
      'scripts',
      'sveltekit-frontend/scripts',
    ],
    filePatterns: [
      /som/i, /cluster/i, /backfill.som/i, /train.som/i, /update.db.cluster/i,
    ],
  },
  {
    id:          'RUNTIME_EVIDENCE_LAYER',
    label:       'Runtime Evidence Layer',
    domain:      'runtime_evidence',
    ontology:    'route_packet',
    topology:    'evidence_collector',
    scanDirs:    [
      'scripts/atlas',
      'sveltekit-frontend/scripts/atlas',
      'scripts',
      'sveltekit-frontend/scripts',
    ],
    filePatterns: [
      /runtime.evidence/i, /collect.runtime/i, /report.route/i, /route.runtime/i,
    ],
  },
  {
    id:          'ACE_AGENT_LAYER',
    label:       'ACE / Agent Layer',
    domain:      'ace_context',
    ontology:    'ace_assembly',
    topology:    'context_planner',
    scanDirs:    [
      'sveltekit-frontend/src/lib/server/ace',
      'sveltekit-frontend/src/lib/server/features/ai/ace',
    ],
    filePatterns: [
      /ace.agent/i, /ace.hit/i, /context.assembler/i, /context.cache/i,
      /kag.dag/i, /gemma4/i, /query.router/i, /tagger/i,
    ],
  },
];

// ── Symbol extraction (simple heuristic — export function/const/class) ────────

function extractExportedSymbols(filePath) {
  try {
    const src = readFileSync(filePath, 'utf8');
    const hits = [];
    // export function foo / export async function foo
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) hits.push(m[1]);
    // export const foo = / export const foo: Type =
    for (const m of src.matchAll(/^export\s+const\s+(\w+)/gm)) hits.push(m[1]);
    // export class Foo
    for (const m of src.matchAll(/^export\s+(?:default\s+)?class\s+(\w+)/gm)) hits.push(m[1]);
    // export type Foo / export interface Foo
    for (const m of src.matchAll(/^export\s+(?:type|interface)\s+(\w+)/gm)) hits.push(m[1]);
    return [...new Set(hits)].slice(0, 20);
  } catch {
    return [];
  }
}

// ── Purpose heuristic from first JSDoc comment or filename ────────────────────

function extractPurpose(filePath) {
  try {
    const src = readFileSync(filePath, 'utf8').slice(0, 1200);
    const m = src.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
    if (m) return m[1].replace(/\s*\*\/$/, '').trim().slice(0, 120);
  } catch {}
  return basename(filePath, extname(filePath)).replace(/[-_]/g, ' ');
}

// ── Scanner ───────────────────────────────────────────────────────────────────

function scanLayer(layer) {
  const entries = [];
  const seen    = new Set();

  for (const relDir of layer.scanDirs) {
    const absDir = join(REPO_ROOT, relDir);
    if (!existsSync(absDir)) continue;

    const allFiles = getFilesRecursive(absDir);

    for (const absPath of allFiles) {
      const file = basename(absPath);
      const ext = extname(file);
      if (!['.ts', '.mjs', '.js'].includes(ext)) continue;
      if (file.endsWith('.d.ts') || file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue;

      const matches = layer.filePatterns.some(p => p.test(file));
      if (!matches) continue;

      const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
      if (seen.has(relPath)) continue;
      seen.add(relPath);

      let size = 0;
      try { size = statSync(absPath).size; } catch {}

      const symbols = extractExportedSymbols(absPath);
      const purpose = extractPurpose(absPath);

      entries.push({
        lane:                  layer.id,
        lane_label:            layer.label,
        file:                  relPath,
        symbols,
        purpose,
        domain_class:          layer.domain,
        ontology_label:        layer.ontology,
        topology_label:        layer.topology,
        size_bytes:            size,
        reuse_before_creating: true,
      });

      if (VERBOSE) {
        console.log(`  [${layer.id}] ${relPath} — ${symbols.slice(0, 3).join(', ')}${symbols.length > 3 ? '…' : ''}`);
      }
    }
  }

  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('🗂️  build-function-registry — scanning layers…\n');

const allEntries = [];
for (const layer of LAYERS) {
  if (VERBOSE) console.log(`Layer: ${layer.label}`);
  const entries = scanLayer(layer);
  allEntries.push(...entries);
  console.log(`  ${layer.label}: ${entries.length} files`);
}

console.log(`\nTotal: ${allEntries.length} entries across ${LAYERS.length} layers`);

if (DRY_RUN) {
  console.log('\n--dry-run: skipping file writes');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

// ── lane-to-function-map.json ─────────────────────────────────────────────────

const mapPath = join(OUT_DIR, 'lane-to-function-map.json');
writeFileSync(mapPath, JSON.stringify(allEntries, null, 2) + '\n');
console.log(`\n✓ ${relative(REPO_ROOT, mapPath).replace(/\\/g, '/')}`);

// ── function-registry.md ─────────────────────────────────────────────────────

const byLane = {};
for (const entry of allEntries) {
  if (!byLane[entry.lane]) byLane[entry.lane] = { label: entry.lane_label, domain: entry.domain_class, ontology: entry.ontology_label, topology: entry.topology_label, entries: [] };
  byLane[entry.lane].entries.push(entry);
}

const mdLines = [
  '# Function Registry — deeds-web-app',
  '',
  `> Generated: ${new Date().toISOString()}`,
  '> Source of truth for agentic coding anti-duplication gate.',
  '',
  '## Anti-Duplication Rule',
  '',
  'Before creating a new file or function:',
  '1. Search `lane-to-function-map.json` for matching lane/symbols.',
  '2. Search `scripts/atlas/`, `src/lib/server/retrieval/`, `src/lib/server/ace/`.',
  '3. If an entry covers ≥60% of the job → **REUSE IT**.',
  '4. Only create new code for missing glue/orchestration.',
  '',
  '---',
  '',
];

for (const [laneId, layer] of Object.entries(byLane)) {
  mdLines.push(`## ${layer.label} \`${laneId}\``);
  mdLines.push('');
  mdLines.push(`| Field | Value |`);
  mdLines.push(`|---|---|`);
  mdLines.push(`| domain_class | \`${layer.domain}\` |`);
  mdLines.push(`| ontology_label | \`${layer.ontology}\` |`);
  mdLines.push(`| topology_label | \`${layer.topology}\` |`);
  mdLines.push('');
  mdLines.push('| File | Symbols | Purpose |');
  mdLines.push('|---|---|---|');
  for (const e of layer.entries) {
    const syms = e.symbols.slice(0, 4).join(', ') || '—';
    mdLines.push(`| \`${e.file}\` | \`${syms}\` | ${e.purpose.slice(0, 80)} |`);
  }
  mdLines.push('');
}

const mdPath = join(OUT_DIR, 'function-registry.md');
writeFileSync(mdPath, mdLines.join('\n') + '\n');
console.log(`✓ ${relative(REPO_ROOT, mdPath).replace(/\\/g, '/')}`);

console.log('\n✅ Registry complete.');
