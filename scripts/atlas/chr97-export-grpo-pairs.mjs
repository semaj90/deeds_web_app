#!/usr/bin/env node
/**
 * chr97-export-grpo-pairs.mjs
 *
 * Convert CHR97 self-play bouts into Unsloth-ready GRPO training pairs.
 *
 * Filtering pipeline:
 *   1. Read .tmp/ingest/chr97-eval-bouts.ndjson
 *   2. Keep bouts where:
 *      - winner === 'challenger' AND reward_delta >= MIN_DELTA  (positive)
 *      - winner === 'defender'   AND reward_delta <= -MIN_DELTA (negative)
 *   3. Per (winningLane, winningCluster) bucket, sample at most MAX_PER_BUCKET
 *      to prevent over-representation of mega-clusters
 *   4. Build GRPO pair:
 *        prompt:  glyph sprite + lane + cluster metadata
 *        chosen:  winner card (sourceRef + meta)
 *        rejected: loser card  (sourceRef + meta)
 *        advantage: reward_delta
 *
 * Output:
 *   training-datasets/chr97-grpo-pairs-<timestamp>.jsonl
 *   training-datasets/chr97-grpo-pairs-latest.jsonl
 *   memory/exports/chr97-grpo-export-report.json
 *
 * Usage:
 *   node scripts/atlas/chr97-export-grpo-pairs.mjs --apply
 *   node scripts/atlas/chr97-export-grpo-pairs.mjs --apply --min-delta 0.05 --max-per-bucket 50
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
function flagVal(name, fallback) {
  const i = argv.findIndex((a) => a.startsWith(name));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : argv[i + 1];
}
const MIN_DELTA = parseFloat(flagVal('--min-delta', '0.05'));
const MAX_PER_BUCKET = parseInt(flagVal('--max-per-bucket', '40'), 10);

const BOUTS_PATH = path.join(ROOT, '.tmp', 'ingest', 'chr97-eval-bouts.ndjson');
const SPRITES_PATH = path.join(ROOT, '.tmp', 'ingest', 'chr97-sprites.ndjson');
const DATASET_DIR = path.join(ROOT, 'training-datasets');
const REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-grpo-export-report.json');

function loadNDJSON(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function buildSpriteMap(sprites) {
  const m = new Map();
  for (const s of sprites) m.set(s.rankedCard.id, s);
  return m;
}

function buildPair(bout, spriteMap) {
  const winnerSide = bout.winner === 'challenger' ? bout.challenger : bout.defender;
  const loserSide = bout.winner === 'challenger' ? bout.defender : bout.challenger;
  const winnerSprite = spriteMap.get(winnerSide.nodeId);
  const loserSprite = spriteMap.get(loserSide.nodeId);

  const prompt =
    `Glyph atlas lane scoring task.\n` +
    `Lane: ${winnerSide.lane}\n` +
    `Cluster: ${winnerSide.cluster}\n` +
    `Sprite hash: ${winnerSprite?.sprite?.hash || 'n/a'}\n\n` +
    `Two candidate code artifacts. Pick the one with stronger atlas signal (higher PageRank-weighted reward).`;

  const chosen = {
    nodeId: winnerSide.nodeId,
    sourceRef: winnerSprite?.rankedCard?.sourceRef || null,
    lane: winnerSide.lane,
    cluster: winnerSide.cluster,
    reward: winnerSide.reward,
    sprite_b64: winnerSprite?.sprite?.bytes_b64 || null,
  };
  const rejected = {
    nodeId: loserSide.nodeId,
    sourceRef: loserSprite?.rankedCard?.sourceRef || null,
    lane: loserSide.lane,
    cluster: loserSide.cluster,
    reward: loserSide.reward,
    sprite_b64: loserSprite?.sprite?.bytes_b64 || null,
  };

  return {
    prompt,
    chosen,
    rejected,
    advantage: Math.abs(bout.reward_delta),
    bout_index: bout.bout,
    metadata: {
      winning_lane: winnerSide.lane,
      winning_cluster: winnerSide.cluster,
      reward_delta: bout.reward_delta,
    },
  };
}

async function main() {
  console.log('\n══ CHR97 → Unsloth GRPO Pairs ════════════════════════════');
  console.log(`  Mode:           ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Min delta:      ${MIN_DELTA}`);
  console.log(`  Max per bucket: ${MAX_PER_BUCKET}`);

  const bouts = loadNDJSON(BOUTS_PATH);
  const sprites = loadNDJSON(SPRITES_PATH);
  const spriteMap = buildSpriteMap(sprites);
  console.log(`  ✅ ${bouts.length} bouts, ${sprites.length} sprites`);

  // Filter strong-signal bouts
  const strongBouts = bouts.filter((b) => Math.abs(b.reward_delta) >= MIN_DELTA && b.winner !== 'draw');
  console.log(`  ✅ ${strongBouts.length} bouts pass |delta| >= ${MIN_DELTA}`);

  // Bucket by (winning lane, cluster), cap each bucket
  const bucketed = new Map();
  for (const b of strongBouts) {
    const winnerSide = b.winner === 'challenger' ? b.challenger : b.defender;
    const key = `${winnerSide.lane}|${winnerSide.cluster}`;
    if (!bucketed.has(key)) bucketed.set(key, []);
    if (bucketed.get(key).length < MAX_PER_BUCKET) bucketed.get(key).push(b);
  }
  const capped = Array.from(bucketed.values()).flat();
  console.log(`  ✅ ${capped.length} bouts after bucket cap (${bucketed.size} buckets)`);

  // Build pairs
  const pairs = capped.map((b) => buildPair(b, spriteMap));
  // Accept pairs that have at minimum a node identity for both sides.
  // SOM and language lanes have no sourceRef — use nodeId as the canonical handle.
  const validPairs = pairs.filter((p) => p.chosen.nodeId && p.rejected.nodeId);
  const withSourceRef = validPairs.filter((p) => p.chosen.sourceRef && p.rejected.sourceRef);
  console.log(`  ✅ ${validPairs.length} pairs (${withSourceRef.length} have sourceRefs)`);

  // Distribution
  const byLane = {};
  const byCluster = {};
  for (const p of validPairs) {
    byLane[p.metadata.winning_lane] = (byLane[p.metadata.winning_lane] || 0) + 1;
    const ck = `c${p.metadata.winning_cluster}`;
    byCluster[ck] = (byCluster[ck] || 0) + 1;
  }

  if (APPLY) {
    fs.mkdirSync(DATASET_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(DATASET_DIR, `chr97-grpo-pairs-${ts}.jsonl`);
    const latestPath = path.join(DATASET_DIR, 'chr97-grpo-pairs-latest.jsonl');
    fs.writeFileSync(outPath, validPairs.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
    fs.copyFileSync(outPath, latestPath);

    const report = {
      timestamp: new Date().toISOString(),
      params: { minDelta: MIN_DELTA, maxPerBucket: MAX_PER_BUCKET },
      input: { bouts: bouts.length, sprites: sprites.length },
      filter: {
        strongBouts: strongBouts.length,
        bucketsBeforeCap: bucketed.size,
        afterCap: capped.length,
        validPairs: validPairs.length,
      },
      distribution: { byLane, byCluster },
      advantageStats: validPairs.length > 0 ? {
        min: Math.min(...validPairs.map((p) => p.advantage)),
        max: Math.max(...validPairs.map((p) => p.advantage)),
        avg: validPairs.reduce((a, b) => a + b.advantage, 0) / validPairs.length,
      } : null,
      outputs: { dataset: outPath, latest: latestPath },
    };
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\n  ✅ Dataset → ${outPath}`);
    console.log(`  ✅ Latest  → ${latestPath}`);
    console.log(`  📝 Report → ${REPORT}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Strong bouts:   ${strongBouts.length} / ${bouts.length}`);
  console.log(`  After cap:      ${capped.length}`);
  console.log(`  Valid pairs:    ${validPairs.length}`);
  console.log(`  Lane mix:       ${Object.entries(byLane).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  Cluster mix:    ${Object.entries(byCluster).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to write JSONL.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});