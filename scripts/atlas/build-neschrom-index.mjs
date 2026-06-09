#!/usr/bin/env node
/**
 * build-neschrom-index.mjs
 *
 * Aggregates neschrom97/cards/ into compact lookup indexes:
 *   neschrom97/index/cards.min.json     — [{id, src_short, som, tags[], gpu}] per card
 *   neschrom97/index/cluster-map.json   — cluster_id → [card_id, ...]
 *   neschrom97/index/tag-map.json       — tag → [card_id, ...]
 *   neschrom97/index/manifest.json      — stats + generated_at
 *
 * Usage:
 *   node scripts/atlas/build-neschrom-index.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS_DIR, INDEX_DIR, ensureDirs } from './_neschrom-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

ensureDirs();

const t0 = Date.now();
console.log('\n── Build NES-CHROM97 Index ────────────────────────────────');
console.log(`  cards:  ${CARDS_DIR}`);
console.log(`  output: ${INDEX_DIR}`);

const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
console.log(`  loaded: ${files.length} card files`);

const minCards = [];
const clusterMap = {};    // som_cluster → [id, ...]
const gpuClusterMap = {}; // gpuCluster → [id, ...]
const tagMap = {};        // tag → [id, ...]

let withSom = 0, withGpu = 0, withTags = 0;

for (const f of files) {
  let card;
  try {
    card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
  } catch { continue; }

  const { id, source, som_cluster, gpuCluster, tags } = card;
  if (!id) continue;

  const src_short = (source ?? '').replace(/^sveltekit-frontend\//, '').slice(0, 80);

  minCards.push({
    id,
    s: src_short,
    c: som_cluster ?? null,
    g: gpuCluster ?? null,
    t: Array.isArray(tags) ? tags.slice(0, 8) : [],
  });

  if (som_cluster != null) {
    withSom++;
    const k = String(som_cluster);
    clusterMap[k] = clusterMap[k] ?? [];
    clusterMap[k].push(id);
  }

  if (gpuCluster != null) {
    withGpu++;
    const k = String(gpuCluster);
    gpuClusterMap[k] = gpuClusterMap[k] ?? [];
    gpuClusterMap[k].push(id);
  }

  if (Array.isArray(tags) && tags.length) {
    withTags++;
    for (const tag of tags.slice(0, 8)) {
      tagMap[tag] = tagMap[tag] ?? [];
      tagMap[tag].push(id);
    }
  }
}

// Sort minCards by som_cluster for deterministic output
minCards.sort((a, b) => (a.c ?? 9999) - (b.c ?? 9999) || a.s.localeCompare(b.s));

// Write outputs
const cardsMinPath   = path.join(INDEX_DIR, 'cards.min.json');
const clusterMapPath = path.join(INDEX_DIR, 'cluster-map.json');
const gpuMapPath     = path.join(INDEX_DIR, 'gpu-cluster-map.json');
const tagMapPath     = path.join(INDEX_DIR, 'tag-map.json');
const manifestPath   = path.join(INDEX_DIR, 'manifest.json');

fs.writeFileSync(cardsMinPath,   JSON.stringify(minCards));
fs.writeFileSync(clusterMapPath, JSON.stringify(clusterMap, null, 2));
fs.writeFileSync(gpuMapPath,     JSON.stringify(gpuClusterMap, null, 2));
fs.writeFileSync(tagMapPath,     JSON.stringify(tagMap, null, 2));

const manifest = {
  generated_at:    new Date().toISOString(),
  total_cards:     files.length,
  with_som:        withSom,
  with_gpu:        withGpu,
  with_tags:       withTags,
  som_clusters:    Object.keys(clusterMap).length,
  gpu_clusters:    Object.keys(gpuClusterMap).length,
  unique_tags:     Object.keys(tagMap).length,
  cards_min_bytes: Buffer.byteLength(JSON.stringify(minCards)),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const elapsed = Date.now() - t0;
console.log(`\n── Results ────────────────────────────────────────────────`);
console.log(`  total cards:   ${manifest.total_cards}`);
console.log(`  with som:      ${manifest.with_som}`);
console.log(`  with gpu:      ${manifest.with_gpu}`);
console.log(`  with tags:     ${manifest.with_tags}`);
console.log(`  som clusters:  ${manifest.som_clusters}`);
console.log(`  gpu clusters:  ${manifest.gpu_clusters}`);
console.log(`  unique tags:   ${manifest.unique_tags}`);
console.log(`  index size:    ${(manifest.cards_min_bytes / 1024).toFixed(1)} KB`);
console.log(`  elapsed:       ${elapsed}ms`);
console.log(`\n  ✅ Index written → ${INDEX_DIR}`);
console.log(`──────────────────────────────────────────────────────────\n`);
