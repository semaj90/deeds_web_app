#!/usr/bin/env node
/**
 * Summary top-K community clusterer
 *
 * Streams all summaries from codebase_chunk_index joined to atlas_packets
 * community assignments. Builds noun-frequency vectors per community using
 * simdjson fast JSON parsing for the chunk evidence JSONB.
 * Writes top-K routing keywords back to atlas_packets.routing_hints[].
 *
 * This gives the canonical PacketTopologyEnvelope's routing_hints field
 * actual semantic content derived from community-level summary analysis,
 * enabling better ACE retrieval grouping without a full re-embedding.
 *
 * Flow:
 *   atlas_packets (community_id, source_ref) JOIN codebase_chunk_index (summary)
 *   → simdjson stream parse summary text per chunk
 *   → noun tokenizer → TF-IDF-lite frequency map per community
 *   → top-K nouns per community → UPDATE atlas_packets SET routing_hints
 *
 * Usage:
 *   node scripts/atlas/cluster-summaries-topk.mjs [--dry-run] [--top-k 12] [--min-community-size 3]
 */

import pg from 'pg';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve('.', '.env') });

const { values: args } = parseArgs({
  options: {
    'dry-run':            { type: 'boolean', default: false },
    'top-k':              { type: 'string',  default: '12' },
    'min-community-size': { type: 'string',  default: '3'  },
    verbose:              { type: 'boolean', default: false },
  },
  strict: false,
});

const DRY_RUN      = args['dry-run'];
const TOP_K        = parseInt(args['top-k'] ?? '12', 10);
const MIN_SIZE     = parseInt(args['min-community-size'] ?? '3', 10);
const VERBOSE      = args['verbose'];

// ── simdjson fast parse (falls back to JSON.parse gracefully) ─────────────────

let simdJsonParse = null;
try {
  const require = createRequire(import.meta.url);
  // Try simd-bridge addon path (from repo root)
  const addonPaths = [
    resolve('.', 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    resolve('.', 'simd-bridge/cpp/build/tensorrt_bridge.node'),
  ];
  for (const p of addonPaths) {
    try {
      const addon = require(p);
      if (typeof addon.simdJsonParse === 'function') {
        simdJsonParse = (s) => JSON.parse(addon.simdJsonParse(s));
        break;
      }
    } catch { /* try next path */ }
  }
} catch { /* addon unavailable */ }

const fastParse = (s) => {
  if (!s || s.length < 2) return null;
  try {
    return simdJsonParse ? simdJsonParse(s) : JSON.parse(s);
  } catch {
    return null;
  }
};

console.log(`[topk] simdjson addon: ${simdJsonParse ? '✅ native' : '⬛ JSON.parse fallback'}`);

// ── Noun tokenizer ────────────────────────────────────────────────────────────
// Extracts content-bearing tokens: lowercase words 4+ chars, no stopwords

const STOPWORDS = new Set([
  'this','that','with','from','have','will','been','were','they','them',
  'their','there','when','what','which','where','also','some','than','into',
  'more','such','each','over','most','then','only','just','even','like',
  'used','using','uses','make','made','code','file','line','type','data',
  'function','class','method','return','object','value','string','number',
  'boolean','array','null','void','async','await','const','import','export',
  'interface','implements','extends','typescript','javascript','svelte',
]);

function extractNouns(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[\s\-_/\\.,;:!?()\[\]{}"'`<>|@#$%^&*+=~]+/)
    .filter(t => t.length >= 4 && !STOPWORDS.has(t) && /^[a-z]/.test(t));
}

// ── TF-IDF lite ───────────────────────────────────────────────────────────────
// document frequency across communities (for IDF weighting)

function buildTopK(termFreqMap, docFreq, totalDocs, k) {
  const scored = [];
  for (const [term, tf] of termFreqMap) {
    const df = docFreq.get(term) ?? 1;
    const idf = Math.log((totalDocs + 1) / (df + 1));
    scored.push({ term, score: tf * idf });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.term);
}

// ── Database ──────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  host:     process.env.PGHOST     ?? '127.0.0.1',
  port:     parseInt(process.env.PGPORT ?? '5434', 10),
  database: process.env.PGDATABASE ?? 'legal_ai_db',
  user:     process.env.PGUSER     ?? 'legal_admin',
  password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '123456',
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Summary Top-K Community Clusterer                            ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  top-k=${TOP_K}  min-community-size=${MIN_SIZE}`.padEnd(66) + '║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Step 1: stream summaries joined to community assignments
  console.log('📥 Step 1: Stream summaries with community assignments...');

  const streamRes = await pool.query(`
    SELECT
      p.community_id,
      p.packet_key,
      p.source_ref,
      cci.summary
    FROM atlas_packets p
    JOIN codebase_chunk_index cci
      ON cci.relative_path = p.source_ref
        OR cci.relative_path = 'sveltekit-frontend/' || p.source_ref
        OR p.source_ref = 'sveltekit-frontend/' || cci.relative_path
    WHERE p.community_id IS NOT NULL
      AND cci.summary IS NOT NULL
      AND length(trim(cci.summary)) > 30
    ORDER BY p.community_id
  `);

  console.log(`   Fetched ${streamRes.rows.length} (community, summary) pairs\n`);

  if (streamRes.rows.length === 0) {
    console.log('   No data — ensure Louvain apply ran and summaries exist.');
    return;
  }

  // Step 2: build term frequency maps per community
  console.log('📊 Step 2: Building term frequency vectors per community...');

  // communityId → Map<term, count>
  const communityTF = new Map();
  // communityId → Set<packet_keys> (to track size)
  const communityPackets = new Map();

  for (const row of streamRes.rows) {
    const { community_id, packet_key, summary } = row;

    if (!communityTF.has(community_id)) {
      communityTF.set(community_id, new Map());
      communityPackets.set(community_id, new Set());
    }

    communityPackets.get(community_id).add(packet_key);

    // Use simdjson fast parse if summary is JSON, otherwise treat as plain text
    let text = summary;
    if (summary.trimStart().startsWith('{')) {
      const parsed = fastParse(summary);
      text = parsed?.text ?? parsed?.content ?? parsed?.summary ?? summary;
    }

    const nouns = extractNouns(text);
    const tf = communityTF.get(community_id);
    for (const noun of nouns) {
      tf.set(noun, (tf.get(noun) ?? 0) + 1);
    }
  }

  // Step 3: compute document frequency across communities
  console.log('📐 Step 3: Computing IDF weights across communities...');
  const docFreq = new Map();
  const totalDocs = communityTF.size;

  for (const tf of communityTF.values()) {
    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  // Step 4: select top-K communities (by size ≥ MIN_SIZE)
  const eligibleCommunities = [...communityTF.entries()]
    .filter(([cid]) => (communityPackets.get(cid)?.size ?? 0) >= MIN_SIZE);

  console.log(`   Total communities: ${communityTF.size}`);
  console.log(`   Eligible (≥${MIN_SIZE} packets): ${eligibleCommunities.length}\n`);

  // Step 5: build routing_hints per community
  console.log('🏷️  Step 5: Building routing_hints arrays...\n');

  // communityId → string[] top-K nouns
  const communityHints = new Map();
  for (const [cid, tf] of eligibleCommunities) {
    const topK = buildTopK(tf, docFreq, totalDocs, TOP_K);
    communityHints.set(cid, topK);
    if (VERBOSE) {
      console.log(`   community ${cid} (${communityPackets.get(cid)?.size} packets): ${topK.join(', ')}`);
    }
  }

  if (DRY_RUN) {
    console.log(`   DRY-RUN: Would update routing_hints for ${communityHints.size} communities`);
    // Show sample
    const sample = [...communityHints.entries()].slice(0, 3);
    for (const [cid, hints] of sample) {
      console.log(`   community ${cid}: [${hints.join(', ')}]`);
    }
    console.log('\n✅ Dry-run complete — no writes.\n');
    return;
  }

  // Step 6: batch UPDATE atlas_packets SET routing_hints per community_id
  console.log('💾 Step 6: Writing routing_hints to atlas_packets...');

  let updated = 0;
  const BATCH = 50; // communities per batch
  const communityArr = [...communityHints.entries()];

  for (let i = 0; i < communityArr.length; i += BATCH) {
    const batch = communityArr.slice(i, i + BATCH);
    // Build VALUES clause: (community_id, hints_array)
    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const [cid, hints] of batch) {
      values.push(cid, hints);
      placeholders.push(`($${idx}::integer, $${idx + 1}::text[])`);
      idx += 2;
    }

    const res = await pool.query(
      `UPDATE atlas_packets AS p
       SET routing_hints = v.hints,
           updated_at = NOW()
       FROM (VALUES ${placeholders.join(', ')}) AS v(community_id, hints)
       WHERE p.community_id = v.community_id`,
      values
    );

    updated += res.rowCount;
    if (VERBOSE && i % (BATCH * 5) === 0) {
      process.stdout.write('.');
    }
  }

  console.log(`   ✅ Updated routing_hints for ${updated} packets across ${communityHints.size} communities\n`);

  // Step 7: verify sample
  const verify = await pool.query(`
    SELECT packet_key, community_id, routing_hints
    FROM atlas_packets
    WHERE routing_hints IS NOT NULL AND array_length(routing_hints, 1) > 0
    ORDER BY page_rank_score DESC NULLS LAST
    LIMIT 5
  `);

  console.log('🔍 Sample routing_hints (top PageRank packets):');
  for (const row of verify.rows) {
    console.log(`   ${row.packet_key} [community ${row.community_id}]: ${(row.routing_hints ?? []).join(', ')}`);
  }
  console.log('\n✅ cluster-summaries-topk complete.\n');
}

run()
  .catch(err => { console.error('[topk] Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end().catch(() => {}));
