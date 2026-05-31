#!/usr/bin/env node
/**
 * chr97-sprite-eval.mjs
 *
 * NES CHR97 sprite generator + ACE packet injection for eval testing.
 *
 * Pipeline:
 *   1. Read parent_atlas_gpu.parquet (GPU-enriched lanes)
 *   2. For each node, generate an 8x8 CHR97 "sprite" — a tiny 2-bit palette
 *      tile derived deterministically from gpu_kmeans_cluster + gpu_reward.
 *      Sprite payload = 16 bytes (NES CHR pattern table format).
 *   3. Pack sprite bytes + node metadata into an ACE Packet:
 *        { kind: 'ace.packet', version: '1.0',
 *          nodeId, lane, sprite_b64, sprite_hash, gpu_features }
 *   4. Run AlphaGo-style self-play eval: pair packets randomly into
 *      (challenger, defender) bouts, score each by gpu_reward delta.
 *      Track win rate per cluster — surfaces which clusters produce
 *      "winning" features for Unsloth training.
 *   5. Output:
 *        - .tmp/ingest/chr97-sprites.ndjson  (one ACE packet per line)
 *        - .tmp/ingest/chr97-eval-bouts.ndjson  (self-play results)
 *        - memory/exports/chr97-eval-report.json
 *
 * Usage:
 *   node scripts/atlas/chr97-sprite-eval.mjs --dry-run
 *   node scripts/atlas/chr97-sprite-eval.mjs --apply
 *   node scripts/atlas/chr97-sprite-eval.mjs --apply --bouts 500 --top 100
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
function flagVal(name, fallback) {
  const i = argv.findIndex((a) => a.startsWith(name) || a === name);
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : argv[i + 1];
}
const BOUTS = parseInt(flagVal('--bouts', '200'), 10);
const TOP_N = parseInt(flagVal('--top', '50'), 10);
const SEED = parseInt(flagVal('--seed', '20260530'), 10);

const PARQUET_IN = path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_gpu.parquet');
const PARQUET_FALLBACK = path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_full.parquet');
const SPRITES_NDJSON = path.join(ROOT, '.tmp', 'ingest', 'chr97-sprites.ndjson');
const BOUTS_NDJSON = path.join(ROOT, '.tmp', 'ingest', 'chr97-eval-bouts.ndjson');
const REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-eval-report.json');

// ─── Read parquet ──────────────────────────────────────────────────────

function readParquet(parquetPath) {
  const tmp = parquetPath + '.chr97.tmp.json';
  const pq = parquetPath.replace(/\\/g, '/');
  const tj = tmp.replace(/\\/g, '/');
  const r = spawnSync('duckdb', [
    '-c',
    `COPY (SELECT * FROM read_parquet('${pq}')) TO '${tj}' (FORMAT JSON, ARRAY TRUE);`,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`duckdb read failed: ${r.stderr || r.stdout}`);
  const data = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  return data;
}

// ─── CHR97 sprite generator ────────────────────────────────────────────
// NES CHR tile format: 16 bytes per 8x8 tile, two planes (low + high bit).
// Pixel value 0-3 per pixel; plane0 byte = LSB, plane1 byte = MSB.

function generateSprite(node) {
  // Deterministic seed: nodeId + cluster + reward
  const seedStr = `${node.node_id}:${node.gpu_kmeans_cluster ?? 0}:${(node.gpu_reward ?? 0).toFixed(3)}`;
  const hash = createHash('sha256').update(seedStr).digest();

  // Build 8 rows × 2 planes = 16 bytes
  const tile = Buffer.alloc(16);
  for (let row = 0; row < 8; row++) {
    // Mix two hash bytes per row, perturbed by reward
    const lo = hash[row] ^ Math.floor((node.gpu_reward ?? 0) * 255);
    const hi = hash[row + 8] ^ ((node.gpu_kmeans_cluster ?? 0) & 0xff);
    tile[row] = lo & 0xff;
    tile[row + 8] = hi & 0xff;
  }
  return tile;
}

// Render to ASCII for human inspection (4 grayscale levels: ' ', '.', '+', '#')
function spriteToAscii(tile) {
  const palette = [' ', '.', '+', '#'];
  const rows = [];
  for (let row = 0; row < 8; row++) {
    const lo = tile[row];
    const hi = tile[row + 8];
    let line = '';
    for (let col = 7; col >= 0; col--) {
      const bit0 = (lo >> col) & 1;
      const bit1 = (hi >> col) & 1;
      line += palette[(bit1 << 1) | bit0];
    }
    rows.push(line);
  }
  return rows.join('\n');
}

// ─── ACE packet builder ────────────────────────────────────────────────

// Engram-shaped sprite packet — meant for injection as an ACE rankedCard
// AND as an engram-registry entry. Aligns with existing
// sveltekit-frontend/src/lib/server/cartridge/glyph-tile-engine.ts conventions.
function buildPacket(node) {
  const tile = generateSprite(node);
  const sprite_hash = createHash('sha256').update(tile).digest('hex').slice(0, 12);
  return {
    // Engram entry shell (compatible with engram-registry.ts)
    engramKey: `glyph:tile:${sprite_hash}`,
    engramKind: 'glyph_tile',
    // Card-shape for ACE rankedCards injection
    rankedCard: {
      id: node.node_id,
      lane: node.lane,
      sourceRef: node.sourceRef || null,
      score: node.gpu_reward || 0,
      kind: 'glyph_tile',
      meta: {
        kmeans_cluster: node.gpu_kmeans_cluster,
        pagerank: node.gpu_pagerank,
        attention: node.gpu_attention,
        reward: node.gpu_reward,
        degree: node.degree || 0,
      },
    },
    // CHR97 tile payload (16 NES CHR bytes, two-plane 8x8 sprite)
    sprite: {
      bytes_b64: tile.toString('base64'),
      hash: sprite_hash,
      ascii: spriteToAscii(tile),
      palette: ['00 transparent', '01 light', '10 mid', '11 dark'],
      origin: 'chr97-sprite-eval',
    },
  };
}

// ─── Self-play eval (AlphaGo-style, CPU vs CPU) ────────────────────────
// Each bout picks two packets and scores by:
//   reward_delta = challenger.gpu_features.reward - defender.gpu_features.reward
// Winner = challenger if reward_delta > 0 else defender.
// Tracks win rate per (lane, cluster) to surface "strong" combinations.

function lcgRandom(seed) {
  // Linear-congruential PRNG, deterministic for reproducibility
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function runSelfPlay(packets, bouts, seed) {
  const rng = lcgRandom(seed);
  const stats = new Map(); // key = `${lane}|${cluster}`, val = {wins, losses, total}
  const bumpStats = (key, win) => {
    if (!stats.has(key)) stats.set(key, { wins: 0, losses: 0, total: 0 });
    const s = stats.get(key);
    s.total++;
    if (win) s.wins++;
    else s.losses++;
  };

  const bouts_log = [];
  for (let b = 0; b < bouts; b++) {
    const ci = Math.floor(rng() * packets.length);
    let di = Math.floor(rng() * packets.length);
    if (di === ci) di = (di + 1) % packets.length;
    const challenger = packets[ci].rankedCard;
    const defender = packets[di].rankedCard;
    const cr = challenger.meta.reward || 0;
    const dr = defender.meta.reward || 0;
    const delta = cr - dr;
    const winner = delta > 0 ? 'challenger' : delta < 0 ? 'defender' : 'draw';

    bumpStats(`${challenger.lane}|${challenger.meta.kmeans_cluster}`, winner === 'challenger');
    bumpStats(`${defender.lane}|${defender.meta.kmeans_cluster}`, winner === 'defender');

    bouts_log.push({
      bout: b,
      challenger: { nodeId: challenger.id, lane: challenger.lane, cluster: challenger.meta.kmeans_cluster, reward: cr },
      defender: { nodeId: defender.id, lane: defender.lane, cluster: defender.meta.kmeans_cluster, reward: dr },
      reward_delta: parseFloat(delta.toFixed(4)),
      winner,
    });
  }

  return { stats, bouts_log };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ CHR97 Sprite Eval ═════════════════════════════════════');
  console.log(`  Mode:     ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Bouts:    ${BOUTS}`);
  console.log(`  Top N:    ${TOP_N}`);
  console.log(`  Seed:     ${SEED}`);

  // Load nodes
  console.log('\n  Step 1: Load atlas...');
  const inputPath = fs.existsSync(PARQUET_IN) ? PARQUET_IN : PARQUET_FALLBACK;
  console.log(`  Input: ${inputPath}`);
  const nodes = readParquet(inputPath);
  console.log(`  ✅ ${nodes.length} nodes`);

  // Pick TOP_N by reward (or degree if no reward)
  console.log(`\n  Step 2: Select top ${TOP_N} by GPU reward...`);
  const ranked = [...nodes].sort((a, b) => (b.gpu_reward || b.degree || 0) - (a.gpu_reward || a.degree || 0));
  const topNodes = ranked.slice(0, TOP_N);
  console.log(`  ✅ Top reward: ${(topNodes[0].gpu_reward || topNodes[0].degree || 0).toFixed(3)}`);
  console.log(`  ✅ Bottom of top-N: ${(topNodes[topNodes.length - 1].gpu_reward || 0).toFixed(3)}`);

  // Generate sprites + ACE packets
  console.log('\n  Step 3: Generate sprites + ACE packets...');
  const packets = topNodes.map((n) => buildPacket(n));
  console.log(`  ✅ ${packets.length} packets`);
  console.log('\n  Sample sprite (top-1):');
  console.log(packets[0].sprite.ascii.split('\n').map((l) => '    ' + l).join('\n'));
  console.log(`    cluster=${packets[0].rankedCard.meta.kmeans_cluster}  reward=${(packets[0].rankedCard.meta.reward || 0).toFixed(3)}  engramKey=${packets[0].engramKey}`);

  // Self-play eval
  console.log(`\n  Step 4: Run ${BOUTS} self-play bouts...`);
  const { stats, bouts_log } = runSelfPlay(packets, BOUTS, SEED);
  console.log(`  ✅ Bouts complete`);

  // Top winning combinations
  const ranked_stats = Array.from(stats.entries())
    .map(([key, s]) => {
      const [lane, cluster] = key.split('|');
      return {
        lane,
        cluster: Number(cluster),
        wins: s.wins,
        losses: s.losses,
        total: s.total,
        winRate: s.total > 0 ? s.wins / s.total : 0,
      };
    })
    .filter((s) => s.total >= 3)
    .sort((a, b) => b.winRate - a.winRate);

  console.log('\n  Top 5 (lane|cluster) by win rate:');
  for (const s of ranked_stats.slice(0, 5)) {
    console.log(`    ${s.lane.padEnd(12)} c${String(s.cluster).padStart(2)}  ${(s.winRate * 100).toFixed(1)}% (${s.wins}/${s.total})`);
  }
  console.log('\n  Bottom 5 by win rate (poor training candidates):');
  for (const s of ranked_stats.slice(-5)) {
    console.log(`    ${s.lane.padEnd(12)} c${String(s.cluster).padStart(2)}  ${(s.winRate * 100).toFixed(1)}% (${s.wins}/${s.total})`);
  }

  // Write artifacts
  if (APPLY) {
    console.log('\n  Step 5: Write artifacts...');
    fs.mkdirSync(path.dirname(SPRITES_NDJSON), { recursive: true });
    fs.writeFileSync(SPRITES_NDJSON, packets.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(BOUTS_NDJSON, bouts_log.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');

    const report = {
      timestamp: new Date().toISOString(),
      seed: SEED,
      inputs: { atlas: inputPath, totalNodes: nodes.length, topN: TOP_N, bouts: BOUTS },
      sprites: { count: packets.length, sizeBytes: 16 * packets.length, palette: ['00 transparent', '01 light', '10 mid', '11 dark'] },
      eval: { totalBouts: bouts_log.length, uniqueGroups: ranked_stats.length },
      topWinners: ranked_stats.slice(0, 10),
      bottomLosers: ranked_stats.slice(-10),
      trainingRecommendation: ranked_stats.length > 0
        ? `Train on top ${Math.min(10, ranked_stats.length)} (lane, cluster) pairs with win rate ≥ ${(ranked_stats[Math.min(9, ranked_stats.length - 1)].winRate * 100).toFixed(0)}%`
        : 'Insufficient data for training recommendation',
    };
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Sprites → ${SPRITES_NDJSON}`);
    console.log(`  ✅ Bouts   → ${BOUTS_NDJSON}`);
    console.log(`  📝 Report → ${REPORT}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Sprites generated: ${packets.length}`);
  console.log(`  Bouts run:         ${bouts_log.length}`);
  console.log(`  Unique (lane,cluster) groups: ${ranked_stats.length}`);
  if (ranked_stats.length > 0) {
    console.log(`  Avg win rate:      ${(ranked_stats.reduce((a, b) => a + b.winRate, 0) / ranked_stats.length * 100).toFixed(1)}%`);
  }
  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to persist artifacts.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
