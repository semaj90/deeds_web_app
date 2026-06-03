#!/usr/bin/env node
/**
 * ndjson-mapreduce-join.mjs
 *
 * Offline MapReduce pipeline for NES/CHROM packet graph traversals.
 *
 * Phases:
 *   1. MAP    — load all .opencode/cards/*.json into a keyed map (card_id → card)
 *   2. MAP    — stream gemma4_candidates.ndjson, join card metadata, emit enriched records
 *   3. MAP    — stream outcome-ledger*.ndjson, join card metadata, emit ledger+card pairs
 *   4. REDUCE — group by SOM cluster (bmu_row:bmu_col), compute:
 *                 - cluster_card_count
 *                 - avg_som_distance
 *                 - top keywords (frequency-ranked)
 *                 - candidate_count (how many are flagged in gemma4_candidates)
 *                 - tag distribution
 *   5. REDUCE — graph adjacency: emit edges for cards sharing the same SOM cluster
 *               (lightweight SIMILAR_TOPOLOGY graph without Neo4j)
 *   6. MINIFY — write compact output: one line per cluster summary + edge list
 *
 * Output files (all in .opencode/ndjson/):
 *   enriched-candidates.ndjson    — candidate + card join
 *   cluster-summary.ndjson        — per-cluster reduce output
 *   graph-edges.ndjson            — SOM adjacency edges for graph traversal
 *   minified-ace-index.ndjson     — compact index for context injection
 *
 * Usage:
 *   node scripts/atlas/ndjson-mapreduce-join.mjs
 *   node scripts/atlas/ndjson-mapreduce-join.mjs --dry-run
 *   node scripts/atlas/ndjson-mapreduce-join.mjs --phase map     (map only)
 *   node scripts/atlas/ndjson-mapreduce-join.mjs --phase reduce  (reduce only, requires map output)
 *   node scripts/atlas/ndjson-mapreduce-join.mjs --phase minify  (minify only)
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const argv    = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const PHASE   = argv[argv.indexOf('--phase') + 1] || 'all';

const CARDS_DIR    = path.join(ROOT, '.opencode/cards');
const OC_DIR       = path.join(ROOT, '.opencode');
const OUT_DIR      = path.join(ROOT, '.opencode/ndjson');
const MANIFEST_PATH = path.join(ROOT, 'docs/reports/parent-atlas-feature-command-atlas.json');

// ─── ID normalization (mirrors nes-chrom-card-store.ts normalizeCardId) ──────

const STRIP_PREFIXES = [
  /^file:/,
  /^sveltekit-frontend[/\\]/,
  /^[A-Za-z]:[/\\].*?sveltekit-frontend[/\\]/,
  /^[/\\]+/,
  /^\.\//,
];

function normalizeCardId(raw) {
  let s = raw.replace(/\\/g, '/').trim();
  for (const prefix of STRIP_PREFIXES) {
    s = s.replace(prefix, '');
  }
  return s;
}

function normalizeSourceRef(raw) {
  return normalizeCardId(raw);
}

/** All lookup key variants for a given source path */
function cardIdVariants(sourceRef) {
  const norm = normalizeCardId(sourceRef);
  const stem = norm.split('/').pop() ?? norm;
  const stemNoExt = stem.replace(/\.[^.]+$/, '');
  return [...new Set([
    norm,
    `file:${norm}`,
    `sveltekit-frontend/${norm}`,
    stem,
    stemNoExt,
  ])];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function writeNdjson(filePath, records) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write ${records.length} records → ${path.relative(ROOT, filePath)}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const out = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`  ✓ ${path.relative(ROOT, filePath)}  (${records.length} records, ${(out.length/1024).toFixed(1)} KB)`);
}

async function streamNdjson(filePath) {
  const records = [];
  if (!fs.existsSync(filePath)) return records;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of rl) {
    if (line.trim()) {
      try { records.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }
  return records;
}

function freq(arr) {
  const m = {};
  for (const v of arr) m[v] = (m[v] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v }));
}

// ─── Phase 0: load feature manifest → cluster→feature_id index ───────────────
// Reads docs/reports/parent-atlas-feature-command-atlas.json and builds a
// Map<somClusterKey, { feature_ids: string[], lane_ids: string[] }> so graph
// edges can carry feature context for multi-hop traversal.

function loadFeatureIndex(cardMap) {
  const featureIndex = new Map(); // somClusterKey → { feature_ids, lane_ids }
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn('  ⚠ feature manifest missing:', MANIFEST_PATH);
    return featureIndex;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    console.warn('  ⚠ failed to parse feature manifest');
    return featureIndex;
  }

  let indexed = 0;
  for (const lane of manifest.lanes ?? []) {
    const laneId = lane.laneId;
    for (const match of lane.topMatches ?? []) {
      const featureKey = match.featureKey;
      if (!featureKey) continue;
      // Look up card by featureKey in cardMap (cards may use featureKey as id)
      for (const [, card] of cardMap) {
        if (!card.som_bmu_row == null || card.som_bmu_col == null) continue;
        const matchesFeature = card.id === featureKey
          || card.feature_key === featureKey
          || (card.source && card.source.includes(featureKey));
        if (!matchesFeature) continue;
        const clusterKey = `${card.som_bmu_row}:${card.som_bmu_col}`;
        if (!featureIndex.has(clusterKey)) {
          featureIndex.set(clusterKey, { feature_ids: [], lane_ids: [] });
        }
        const entry = featureIndex.get(clusterKey);
        if (!entry.feature_ids.includes(featureKey)) {
          entry.feature_ids.push(featureKey);
          indexed++;
        }
        if (!entry.lane_ids.includes(laneId)) entry.lane_ids.push(laneId);
      }
      // Also index by sourceRefs paths → card lookup
      for (const ref of match.sourceRefs ?? []) {
        const refPath = ref.replace(/^local:/, '').split('#')[0];
        const normalized = refPath.replace(/\\/g, '/');
        const card = cardMap.get(`file:${normalized}`) || cardMap.get(normalized);
        if (!card || card.som_bmu_row == null) continue;
        const clusterKey = `${card.som_bmu_row}:${card.som_bmu_col}`;
        if (!featureIndex.has(clusterKey)) {
          featureIndex.set(clusterKey, { feature_ids: [], lane_ids: [] });
        }
        const entry = featureIndex.get(clusterKey);
        if (!entry.feature_ids.includes(featureKey)) {
          entry.feature_ids.push(featureKey);
          indexed++;
        }
        if (!entry.lane_ids.includes(laneId)) entry.lane_ids.push(laneId);
      }
    }
  }

  console.log(`  Feature index: ${featureIndex.size} clusters with feature context (${indexed} feature_id placements)`);
  return featureIndex;
}

// ─── Phase 1: MAP — load card index ──────────────────────────────────────────

function mapCards() {
  console.log('\n── Phase 1: MAP cards ──────────────────────────────────────');
  const cardMap = new Map();
  if (!fs.existsSync(CARDS_DIR)) {
    console.warn('  ⚠ cards dir missing:', CARDS_DIR);
    return cardMap;
  }
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  let loaded = 0;
  for (const f of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
      if (card.id) {
        cardMap.set(card.id, card);
        // index by all normalized source path variants using shared normalizeCardId()
        if (card.source) {
          for (const variant of cardIdVariants(card.source)) {
            if (!cardMap.has(variant)) cardMap.set(variant, card);
            if (!cardMap.has(`file:${variant}`)) cardMap.set(`file:${variant}`, card);
          }
          // legacy stem: prefix for backward compat
          const stem = card.source.replace(/\\/g, '/').split('/').pop();
          if (stem && !cardMap.has(`stem:${stem}`)) cardMap.set(`stem:${stem}`, card);
        }
        loaded++;
      }
    } catch { /* skip corrupt card */ }
  }
  console.log(`  Loaded ${loaded} cards from ${files.length} files`);
  return cardMap;
}

// ─── Phase 2: MAP — join candidates + cards ──────────────────────────────────

async function mapCandidates(cardMap) {
  console.log('\n── Phase 2: MAP candidates join ────────────────────────────');
  const candidatesPath = path.join(OC_DIR, 'gemma4_candidates.ndjson');
  const candidates = await streamNdjson(candidatesPath);
  console.log(`  Read ${candidates.length} candidates`);

  const enriched = candidates.map(c => {
    // Use normalizeCardId() variants — same logic as nes-chrom-card-store.ts
    // to bridge file:src/..., src/..., sveltekit-frontend/src/..., absolute paths
    const norm = normalizeCardId(c.card_id);
    const stem = norm.split('/').pop() ?? norm;
    let card = cardMap.get(c.card_id) || null;
    if (!card) {
      for (const variant of cardIdVariants(c.card_id)) {
        card = cardMap.get(variant) || cardMap.get(`file:${variant}`) || null;
        if (card) break;
      }
    }
    // fallback: stem-only match
    if (!card) card = cardMap.get(`stem:${stem}`) || null;
    return {
      card_id:    c.card_id,
      reasons:    c.reasons || [],
      keywords:   c.keywords || [],
      tags:       c.tags || [],
      summary:    c.summary || '',
      // joined card fields
      title:      card?.title || null,
      source:     card?.source || null,
      som_row:    card?.som_bmu_row ?? null,
      som_col:    card?.som_bmu_col ?? null,
      som_dist:   card?.som_bmu_distance ?? null,
      has_card:   card !== null,
    };
  });

  const matched = enriched.filter(e => e.has_card).length;
  console.log(`  Joined: ${matched}/${enriched.length} candidates matched to cards`);
  return enriched;
}

// ─── Phase 3: MAP — join outcome ledger + cards ───────────────────────────────

async function mapLedger(cardMap) {
  console.log('\n── Phase 3: MAP outcome ledger join ────────────────────────');
  const ledgerFiles = [
    path.join(OC_DIR, 'outcome-ledger.ndjson'),
    path.join(OC_DIR, 'outcome-ledger-with-cardIds.ndjson'),
  ];
  const allEntries = [];
  for (const f of ledgerFiles) {
    const entries = await streamNdjson(f);
    for (const e of entries) {
      const card = cardMap.get(e.card_id) || null;
      allEntries.push({ ...e, title: card?.title || null, som_row: card?.som_bmu_row ?? null, som_col: card?.som_bmu_col ?? null });
    }
  }
  console.log(`  Ledger entries: ${allEntries.length}`);
  return allEntries;
}

// ─── Phase 4: REDUCE — cluster summaries ─────────────────────────────────────

function reduceClusterSummaries(enrichedCandidates, allCards, featureIndex = new Map()) {
  console.log('\n── Phase 4: REDUCE cluster summaries ───────────────────────');

  // Group ALL cards by SOM cluster
  const clusters = new Map();

  for (const [, card] of allCards) {
    const row = card.som_bmu_row;
    const col = card.som_bmu_col;
    if (row == null || col == null) continue;
    const key = `${row}:${col}`;
    if (!clusters.has(key)) {
      clusters.set(key, { som_row: row, som_col: col, cards: [], candidates: [], all_keywords: [], all_tags: [], distances: [] });
    }
    const c = clusters.get(key);
    c.cards.push(card.id);
    if (card.som_bmu_distance != null) c.distances.push(card.som_bmu_distance);
  }

  // Mark which clusters have flagged candidates
  const candidatesBySom = new Map();
  for (const c of enrichedCandidates) {
    if (c.som_row == null) continue;
    const key = `${c.som_row}:${c.som_col}`;
    if (!candidatesBySom.has(key)) candidatesBySom.set(key, []);
    candidatesBySom.get(key).push(c.card_id);
    // also collect keywords per cluster
    const cluster = clusters.get(key);
    if (cluster) {
      cluster.all_keywords.push(...(c.keywords || []));
      cluster.all_tags.push(...(c.tags || []));
    }
  }

  const summaries = [];
  for (const [key, c] of clusters) {
    const candidates = candidatesBySom.get(key) || [];
    const avgDist = c.distances.length ? c.distances.reduce((a, b) => a + b, 0) / c.distances.length : null;
    const topKeywords = freq(c.all_keywords).slice(0, 8).map(x => x.k);
    const topTags     = freq(c.all_tags).slice(0, 6).map(x => x.k);

    const feat = featureIndex.get(key);
    summaries.push({
      cluster_key:      key,
      som_row:          c.som_row,
      som_col:          c.som_col,
      card_count:       c.cards.length,
      candidate_count:  candidates.length,
      avg_som_dist:     avgDist ? +avgDist.toFixed(4) : null,
      top_keywords:     topKeywords,
      top_tags:         topTags,
      // feature context for page source + archival recommendation joins
      feature_ids:      feat?.feature_ids?.length ? feat.feature_ids : undefined,
      lane_ids:         feat?.lane_ids?.length    ? feat.lane_ids    : undefined,
      // sample card IDs for adjacency (keep first 5 for edge generation)
      card_sample:      c.cards.slice(0, 5),
    });
  }

  summaries.sort((a, b) => b.card_count - a.card_count);
  console.log(`  ${summaries.length} clusters reduced (${[...clusters.values()].reduce((s, c) => s + c.cards.length, 0)} total cards)`);
  return summaries;
}

// ─── Phase 5: REDUCE — SOM adjacency graph edges ─────────────────────────────

function reduceGraphEdges(clusterSummaries, featureIndex) {
  console.log('\n── Phase 5: REDUCE graph edges (SOM adjacency) ─────────────');

  // Build grid lookup
  const grid = new Map();
  for (const c of clusterSummaries) {
    grid.set(`${c.som_row}:${c.som_col}`, c);
  }

  const edges = [];
  const seen  = new Set();

  for (const c of clusterSummaries) {
    const neighbors = [
      [c.som_row - 1, c.som_col],
      [c.som_row + 1, c.som_col],
      [c.som_row, c.som_col - 1],
      [c.som_row, c.som_col + 1],
    ];
    for (const [nr, nc] of neighbors) {
      const nk = `${nr}:${nc}`;
      if (!grid.has(nk)) continue;
      const edgeKey = [c.cluster_key, nk].sort().join('→');
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const neighbor = grid.get(nk);

      // Carry feature context for multi-hop traversal
      const srcFeat = featureIndex.get(c.cluster_key);
      const dstFeat = featureIndex.get(nk);
      const allFeatureIds = [...new Set([
        ...(srcFeat?.feature_ids ?? []),
        ...(dstFeat?.feature_ids ?? []),
      ])];
      const allLaneIds = [...new Set([
        ...(srcFeat?.lane_ids ?? []),
        ...(dstFeat?.lane_ids ?? []),
      ])];

      edges.push({
        src:         c.cluster_key,
        dst:         nk,
        type:        'SIMILAR_TOPOLOGY',
        src_cards:   c.card_count,
        dst_cards:   neighbor.card_count,
        shared_kw:   c.top_keywords.filter(k => neighbor.top_keywords.includes(k)).length,
        // feature_ids / lane_ids enable page source and archival recommendation joins
        feature_ids: allFeatureIds.length ? allFeatureIds : undefined,
        lane_ids:    allLaneIds.length    ? allLaneIds    : undefined,
      });
    }
  }

  const withFeatures = edges.filter(e => e.feature_ids?.length).length;
  console.log(`  ${edges.length} adjacency edges generated (${withFeatures} with feature_id context)`);
  return edges;
}

// ─── Phase 6: MINIFY — compact ACE index ─────────────────────────────────────

function minifyAceIndex(clusterSummaries, enrichedCandidates) {
  console.log('\n── Phase 6: MINIFY compact ACE index ───────────────────────');

  // Top 50 clusters by card_count, emit single compact line per cluster
  const topClusters = clusterSummaries.slice(0, 50).map(c => ({
    ck: c.cluster_key,
    n:  c.card_count,
    cn: c.candidate_count,
    kw: c.top_keywords.slice(0, 4).join(','),
    fi: c.feature_ids?.slice(0, 3).join('|') || undefined,
  }));

  // Candidates with card match, sorted by reason count (most problematic first)
  const topCandidates = enrichedCandidates
    .filter(c => c.has_card)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 100)
    .map(c => ({
      id:  c.card_id,
      r:   c.reasons.slice(0, 2).join('|'),
      kw:  c.keywords.slice(0, 3).join(','),
    }));

  console.log(`  ${topClusters.length} cluster entries + ${topCandidates.length} candidate entries`);
  return [...topClusters.map(c => ({ _t: 'cluster', ...c })),
          ...topCandidates.map(c => ({ _t: 'candidate', ...c }))];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ NES/CHROM NDJSON MapReduce Pipeline ═════════════════════');
  console.log(`  Root:  ${ROOT}`);
  console.log(`  Phase: ${PHASE}`);
  console.log(`  Mode:  ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // Phase 0: load feature manifest for source_id → feature_id join on edges
  // Phase 1: MAP cards (always needed)
  const cardMap      = mapCards();
  const featureIndex = loadFeatureIndex(cardMap);

  // Phase 2+3: MAP joins
  const enrichedCandidates = (PHASE === 'all' || PHASE === 'map' || PHASE === 'reduce' || PHASE === 'minify')
    ? await mapCandidates(cardMap)
    : [];

  const ledgerEntries = (PHASE === 'all' || PHASE === 'map')
    ? await mapLedger(cardMap)
    : [];

  if (PHASE === 'all' || PHASE === 'map') {
    writeNdjson(path.join(OUT_DIR, 'enriched-candidates.ndjson'), enrichedCandidates);
    writeNdjson(path.join(OUT_DIR, 'enriched-ledger.ndjson'), ledgerEntries);
  }

  // Phase 4+5: REDUCE
  let clusterSummaries = [];
  let graphEdges       = [];

  if (PHASE === 'all' || PHASE === 'reduce') {
    clusterSummaries = reduceClusterSummaries(enrichedCandidates, cardMap, featureIndex);
    graphEdges       = reduceGraphEdges(clusterSummaries, featureIndex);

    writeNdjson(path.join(OUT_DIR, 'cluster-summary.ndjson'), clusterSummaries);
    writeNdjson(path.join(OUT_DIR, 'graph-edges.ndjson'), graphEdges);
  }

  // Phase 6: MINIFY
  if (PHASE === 'all' || PHASE === 'minify') {
    if (!clusterSummaries.length) {
      // Load from reduce output if running minify standalone
      clusterSummaries = await streamNdjson(path.join(OUT_DIR, 'cluster-summary.ndjson'));
    }
    const minified = minifyAceIndex(clusterSummaries, enrichedCandidates);
    writeNdjson(path.join(OUT_DIR, 'minified-ace-index.ndjson'), minified);
  }

  console.log('\n══ Done ═════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
