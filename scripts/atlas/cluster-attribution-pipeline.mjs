#!/usr/bin/env node
/**
 * cluster-attribution-pipeline.mjs — Phase 3: Cluster Attribution
 *
 * Joins .opencode/cards/*.json to Qdrant codebase_chunks_768 payloads
 * by matching card.source (file path) to point.payload.file_path.
 * Writes som_cluster + gpuCluster back to card JSON files.
 *
 * Usage:
 *   node scripts/atlas/cluster-attribution-pipeline.mjs --dry-run
 *   node scripts/atlas/cluster-attribution-pipeline.mjs --apply
 *   node scripts/atlas/cluster-attribution-pipeline.mjs --apply --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const CARDS_DIR    = path.join(ROOT, '.opencode', 'cards');
const EXPORTS_DIR  = path.join(ROOT, 'memory', 'exports');
const REPORT_PATH  = path.join(EXPORTS_DIR, 'cluster-attribution-report.json');
const SUMMARY_PATH = path.join(EXPORTS_DIR, 'cluster-summary.json');

const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION   = 'codebase_chunks_768';
const SCROLL_LIMIT = 500; // points per scroll page

// ─── Normalize source → file_path ─────────────────────────────────────────
// Cards store source as backslash paths; Qdrant stores forward-slash file_path.
// Qdrant codebase_chunks_768 was indexed from sveltekit-frontend/ so paths are
// relative to that dir (e.g. "src/routes/..." not "sveltekit-frontend/src/...").
function normalizeSource(src) {
  if (!src) return null;
  let s = src.split('\\').join('/');
  // strip sveltekit-frontend/ prefix if present
  s = s.replace(/^.*?sveltekit-frontend\//, '');
  // strip other leading path components until a known repo-relative prefix
  s = s.replace(/^.*?(?=src\/|scripts\/|docs\/|proto\/|memory\/)/, '');
  return s;
}

// ─── Load all cards ────────────────────────────────────────────────────────
function loadCards() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const cards = [];
  for (const file of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      if (card.id && card.source) cards.push({ file, card });
    } catch { /* skip malformed */ }
  }
  return cards;
}

// ─── Build file_path → cluster map from Qdrant ────────────────────────────
async function buildClusterMap() {
  const map = new Map(); // file_path → { som_cluster, gpuCluster }
  let offset = null;
  let page = 0;

  console.log(`  Scrolling Qdrant ${COLLECTION} for cluster payloads...`);
  while (true) {
    const body = {
      limit: SCROLL_LIMIT,
      with_payload: ['file_path', 'som_cluster', 'gpuCluster'],
      with_vector: false,
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];

    for (const pt of points) {
      const fp = pt.payload?.file_path;
      const sc = pt.payload?.som_cluster;
      const gc = pt.payload?.gpuCluster;
      if (fp && (sc != null || gc != null)) {
        // keep highest-confidence entry (prefer one with both fields)
        const existing = map.get(fp);
        if (!existing || (sc != null && gc != null)) {
          map.set(fp, { som_cluster: sc ?? null, gpuCluster: gc ?? null });
        }
      }
    }

    page++;
    if (VERBOSE && page % 10 === 0) console.log(`    page ${page}, ${map.size} unique paths indexed`);

    offset = data.result?.next_page_offset;
    if (!offset || points.length === 0) break;
  }

  console.log(`  ✅ Indexed ${map.size} file paths with cluster assignments (${page} pages)`);
  return map;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Cluster Attribution Pipeline (Phase 3) ─────────────────');
  console.log(`  mode: ${DRY_RUN ? 'DRY-RUN (--apply to write)' : 'APPLY'}`);

  const cards = loadCards();
  console.log(`  ✅ Loaded ${cards.length} cards`);

  const clusterMap = await buildClusterMap();

  let matched = 0, unmatched = 0, updated = 0, alreadyHas = 0;
  const clusterDist = {};

  for (const { file, card } of cards) {
    const normSource = normalizeSource(card.source);
    const hit = normSource ? clusterMap.get(normSource) : null;

    if (hit) {
      matched++;
      const sc = hit.som_cluster;
      const gc = hit.gpuCluster;

      if (sc != null) {
        clusterDist[sc] = (clusterDist[sc] ?? 0) + 1;
      }

      const needsUpdate = card.som_cluster == null || card.gpuCluster == null;
      if (needsUpdate) {
        updated++;
        if (!DRY_RUN) {
          const enriched = { ...card };
          if (sc != null) enriched.som_cluster = sc;
          if (gc != null) enriched.gpuCluster = gc;
          fs.writeFileSync(path.join(CARDS_DIR, file), JSON.stringify(enriched, null, 2), 'utf8');
        }
        if (VERBOSE) console.log(`    [enrich] ${card.id} → som_cluster=${sc} gpuCluster=${gc}`);
      } else {
        alreadyHas++;
      }
    } else {
      unmatched++;
      if (VERBOSE) console.log(`    [miss] ${card.id} source="${card.source}"`);
    }
  }

  // Reports
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const sortedClusters = Object.entries(clusterDist)
    .sort((a, b) => b[1] - a[1])
    .map(([clusterId, count]) => ({ clusterId: Number(clusterId), count }));

  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    phase: 'Phase 3: Cluster Attribution',
    cards: { total: cards.length, matched, unmatched, updated, alreadyHas },
    qdrant: { collection: COLLECTION, uniqueFilePaths: clusterMap.size },
    clusterDistribution: sortedClusters,
  };
  const summary = {
    timestamp: new Date().toISOString(),
    total: cards.length, matched, unmatched, updated,
    uniqueClusters: sortedClusters.length,
    topClusters: sortedClusters.slice(0, 10),
  };

  if (!DRY_RUN) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    console.log(`  ✅ Wrote report → memory/exports/cluster-attribution-report.json`);
    console.log(`  ✅ Wrote summary → memory/exports/cluster-summary.json`);
  }

  console.log('\n── Results ────────────────────────────────────────────────');
  console.log(`  Cards total:       ${cards.length}`);
  console.log(`  Matched to Qdrant: ${matched}`);
  console.log(`  Unmatched:         ${unmatched}`);
  console.log(`  Newly enriched:    ${updated}${DRY_RUN ? ' (dry-run, not written)' : ''}`);
  console.log(`  Already had data:  ${alreadyHas}`);
  console.log(`  Unique clusters:   ${sortedClusters.length}`);
  if (sortedClusters.length > 0) {
    console.log(`  Top clusters:      ${sortedClusters.slice(0, 5).map(c => `${c.clusterId}(${c.count})`).join('  ')}`);
  }

  if (DRY_RUN) {
    console.log('\n  Run with --apply to write enriched cards and reports.');
  } else {
    console.log('\n  ✅ Phase 3 complete → ready for Phase 4 (Vector64 dry-run)');
  }
}

main().catch(err => {
  console.error('\n❌', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
