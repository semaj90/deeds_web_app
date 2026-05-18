#!/usr/bin/env node
/**
 * hermes-autotuner.mjs
 *
 * Closed-loop reinforcement autotuner for the two-tier Search Engine architecture.
 * Supports multi-tenant isolated tuning alongside a globally optimized baseline.
 *
 * Tasks:
 *   1. Reads telemetry logs from Postgres 'llm_synthesis_events' and 'context_timeline' tables.
 *   2. Group queries by user_id to compute tenant-specific statistics.
 *   3. Evaluates Stage A0 Cartridge hit rate, Qdrant fallback rate, and semantic overlap precision.
 *   4. Dynamically adjusts the A0 exit threshold in Redis (global and per-user):
 *        - High overlap (>75%) -> Proactively lower threshold (default 0.7 -> 0.55) to maximize high-speed sub-5ms CPU exits.
 *        - Low overlap (<40%) -> Proactively raise threshold (default 0.7 -> 0.85) to force deep Qdrant/Neo4j checks.
 *   5. Adapts the QueryRouter4x4 matrix weights in Redis based on Hebbian reward feedback.
 *   6. Outputs a beautiful structural telemetry dashboard and updates Redis keys.
 */

import pg from 'pg';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Configuration & Environment Setup ──────────────────────────────────────────

const ENV_PATH = resolve(process.cwd(), '.env');
let DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/legal_ai_db';
let REDIS_URL = 'redis://127.0.0.1:6379';

if (existsSync(ENV_PATH)) {
  const envContent = readFileSync(ENV_PATH, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (key === 'DATABASE_URL') DATABASE_URL = val;
      if (key === 'REDIS_URL') REDIS_URL = val;
    }
  }
}

// Parse Command Line Arguments
const args = process.argv.slice(2);
let targetUserId = null;
const userIdx = args.indexOf('--userId');
if (userIdx !== -1 && args[userIdx + 1]) {
  targetUserId = parseInt(args[userIdx + 1], 10);
}

// ── Default QueryRouter4x4 matrix (row = backend, col = signal) ────────────────
const DEFAULT_MATRIX = [
  // sem   lex   graph  trust
  [0.80, 0.30, 0.20, 0.50],  // Qdrant
  [0.25, 0.70, 0.10, 0.20],  // Postgres
  [0.15, 0.10, 0.90, 0.10],  // Neo4j
  [0.35, 0.20, 0.40, 0.60],  // MCP
];

async function tuneGroup(redis, events, userId = null) {
  const scopeLabel = userId != null ? `User ${userId}` : 'Global Baseline';
  console.log(`\n🔄 Evaluating telemetry for ${scopeLabel} (${events.length} events)...`);

  let a0Hits = 0;
  let fallbackRuns = 0;
  let totalOverlaps = 0;
  let overlapCount = 0;

  for (const ev of events) {
    const cacheKeys = ev.cache_keys || {};
    const acePacket = ev.ace_packet || {};

    // Check if this query went early-exit fast path
    const wasA0Hit = cacheKeys.cartridge_hit === true || 
                     (acePacket.retrievalStats && acePacket.retrievalStats.earlyExit === true);

    if (wasA0Hit) {
      a0Hits++;
    } else {
      fallbackRuns++;
      // Evaluate overlap quality between final RAG citations and cartridge seed chunks
      const finalRefs = ev.source_refs || [];
      const seedChunks = acePacket.seedChunks || [];
      if (finalRefs.length > 0 && seedChunks.length > 0) {
        const seedSet = new Set(seedChunks.map(c => c.filePath));
        const matches = finalRefs.filter(ref => seedSet.has(ref)).length;
        const overlap = matches / finalRefs.length;
        totalOverlaps += overlap;
        overlapCount++;
      }
    }
  }

  const hitRate = events.length > 0 ? (a0Hits / events.length) : 0;
  const avgOverlap = overlapCount > 0 ? (totalOverlaps / overlapCount) : 0.82; // Default fallback to high quality

  console.log(`📊 Evaluation Matrix [${scopeLabel}]:`);
  console.log(`   ├─ Stage A0 Fast-Path Exit Rate: ${(hitRate * 100).toFixed(1)}% (${a0Hits}/${events.length} hits)`);
  console.log(`   ├─ Falling back to Vector Lane:  ${((1 - hitRate) * 100).toFixed(1)}% (${fallbackRuns}/${events.length} runs)`);
  console.log(`   ├─ Overlap Precision Score:     ${(avgOverlap * 100).toFixed(1)}% (Cartridge vs Qdrant-Rerank match)`);

  // ── 3. Dynamic Threshold Tuning (Closed-Loop Invalidation) ───────────────
  const thresholdKey = userId != null ? `ace:cartridge:${userId}:threshold` : 'ace:cartridge:threshold';
  let currentThreshold = 0.7;
  const thresholdVal = await redis.get(thresholdKey);
  if (thresholdVal) {
    currentThreshold = parseFloat(thresholdVal);
  } else if (userId != null) {
    // Seed from global threshold baseline
    const globalVal = await redis.get('ace:cartridge:threshold');
    if (globalVal) currentThreshold = parseFloat(globalVal);
  }

  let nextThreshold = currentThreshold;

  if (avgOverlap >= 0.75) {
    // Cartridge is highly accurate! Lower the threshold to promote faster exits
    nextThreshold = Math.max(0.45, currentThreshold - 0.05);
    console.log(`🎯 [OPTIMIZE] High overlap. Lowering exit threshold: ${currentThreshold.toFixed(2)} ➔ ${nextThreshold.toFixed(2)} (Sub-5ms CPU first pass active)`);
  } else if (avgOverlap < 0.50) {
    // Cartridge missed items that vector reranking found. Raise threshold to force deep checks
    nextThreshold = Math.min(0.90, currentThreshold + 0.05);
    console.log(`🎯 [WARNING] Low overlap. Raising exit threshold: ${currentThreshold.toFixed(2)} ➔ ${nextThreshold.toFixed(2)} (Forcing deep network ANN retrieval)`);
  } else {
    console.log(`🎯 [STABLE] Overlap normal. Retaining exit threshold: ${currentThreshold.toFixed(2)}`);
  }

  await redis.set(thresholdKey, nextThreshold.toFixed(2));

  // ── 4. Hebbian Routing Matrix Adaptation ──────────────────────────────────
  const matrixKey = userId != null ? `ace:router4x4:matrix:${userId}` : 'ace:router4x4:matrix';
  let matrix = DEFAULT_MATRIX.map(row => [...row]);
  const savedMatrix = await redis.get(matrixKey);
  if (savedMatrix) {
    try {
      matrix = JSON.parse(savedMatrix);
    } catch {
      matrix = DEFAULT_MATRIX.map(row => [...row]);
    }
  } else if (userId != null) {
    // Seed from global adapted baseline
    const globalMatrix = await redis.get('ace:router4x4:matrix');
    if (globalMatrix) {
      try { matrix = JSON.parse(globalMatrix); } catch {}
    }
  }

  const lr = 0.015; // Learning rate

  console.log(`🤖 Running Hebbian reinforcement on ${scopeLabel} 4x4 matrix...`);
  for (const ev of events) {
    const query = ev.query || '';
    const acePacket = ev.ace_packet || {};
    const stats = acePacket.retrievalStats || {};

    // Heuristic signal extraction
    const isLexical = /[A-Z]{2,}|\b\d{4}\b|§/g.test(query);
    const isGraph = /\b(depend|import|class|cluster|related)\b/i.test(query);
    const isSemantic = query.split(/\s+/).length > 8 && !isLexical;

    const signals = [
      isSemantic ? 0.8 : 0.2,
      isLexical ? 0.9 : 0.1,
      isGraph ? 0.9 : 0.1,
      0.1 // Trust pressure default
    ];

    // Rewards mapping
    const rewards = [0, 0, 0, 0];
    if (stats.qdrantHits > 0) rewards[0] = 0.8;
    if (stats.postgresHits > 0) rewards[1] = 0.9;
    if (stats.neo4jHits > 0) rewards[2] = 0.95;
    
    // Adapt weights: M[i][j] += lr * reward[i] * signal[j]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        matrix[i][j] = Math.max(0, Math.min(1.5,
          matrix[i][j] + lr * rewards[i] * signals[j]
        ));
      }
    }
  }

  // Normalize rows to prevent weight saturation
  for (let i = 0; i < 4; i++) {
    const rowSum = matrix[i].reduce((a, b) => a + b, 0);
    if (rowSum > 4.0) {
      matrix[i] = matrix[i].map(w => (w / rowSum) * 3.0);
    }
  }

  await redis.set(matrixKey, JSON.stringify(matrix));
  console.log(`✅ Adapted QueryRouter4x4 matrix updated in Redis.`);

  // ── 5. Render Adapted HUD ──────────────────────────────────────────────────
  console.log(`\n⚙️  ===============================================================`);
  console.log(`       🧠 ADAPTED ${scopeLabel.toUpperCase()} MATRIX M (ROUTING SHARES)`);
  console.log('==================================================================');
  console.log('                 Semantic    Lexical      Graph      Trust');
  const rowNames = ['Qdrant ANN', 'Postgres FTS', 'Neo4j GDS', 'MCP Agent'];
  for (let i = 0; i < 4; i++) {
    const rowStr = matrix[i].map(w => w.toFixed(3).padStart(10)).join('');
    console.log(`${rowNames[i].padEnd(14)}➔${rowStr}`);
  }
  console.log('==================================================================');
}

async function runAutotuner() {
  console.log('\n🧠 ===============================================================');
  console.log('       ⚡ AUTONOMOUS HERMES: MULTI-TENANT RETRIEVAL AUTO-TUNER ⚡');
  console.log('==================================================================');
  console.log(`🔌 Database: ${DATABASE_URL}`);
  console.log(`🔌 Redis:    ${REDIS_URL}`);
  if (targetUserId != null) {
    console.log(`🎯 Target User: User ${targetUserId}`);
  }
  console.log('==================================================================\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });

  try {
    // ── 1. Fetch Telemetry Stats from PostgreSQL ─────────────────────────────
    console.log('🔄 Loading synthesis telemetry events from Postgres...');
    const client = await pool.connect();
    
    // Check total logged synthesis events
    const countRes = await client.query('SELECT COUNT(*) FROM llm_synthesis_events');
    const totalEvents = parseInt(countRes.rows[0].count, 10);
    console.log(`ℹ️ Total LLM Synthesis Events logged: ${totalEvents}`);

    // Fetch active queries for pattern analysis
    let queryText = 'SELECT id, query, ace_packet, cache_keys, source_refs, user_id, created_at FROM llm_synthesis_events';
    const queryParams = [];
    if (targetUserId != null) {
      queryText += ' WHERE user_id = $1';
      queryParams.push(targetUserId);
    }
    queryText += ' ORDER BY created_at DESC LIMIT 100';

    const telemetryRes = await client.query(queryText, queryParams);
    client.release();

    const events = telemetryRes.rows;
    console.log(`✔️ Fetched last ${events.length} active queries for pattern analysis.`);

    if (events.length === 0) {
      console.log('⚠️ No telemetry events found. Seeding default baseline threshold in Redis...');
      await redis.set('ace:cartridge:threshold', '0.7');
      await redis.set('ace:router4x4:matrix', JSON.stringify(DEFAULT_MATRIX));
      console.log('✅ Baseline configurations initialized in Redis.');
      return;
    }

    // ── 2. Global Autotuning Sweep ───────────────────────────────────────────
    if (targetUserId == null) {
      await tuneGroup(redis, events, null);
    }

    // ── 3. Multi-Tenant Group-By Autotuning ──────────────────────────────────
    if (targetUserId != null) {
      // Tune specifically for the target user
      await tuneGroup(redis, events, targetUserId);
    } else {
      // Sweep and identify unique users in the last 100 events
      const userGroups = new Map();
      for (const ev of events) {
        if (ev.user_id != null) {
          const uid = parseInt(ev.user_id, 10);
          if (!userGroups.has(uid)) userGroups.set(uid, []);
          userGroups.get(uid).push(ev);
        }
      }

      console.log(`\n👥 Surfaced ${userGroups.size} active user profiles in telemetry logs.`);
      for (const [userId, userEvents] of userGroups.entries()) {
        // Only trigger per-user tuning if they have at least 2 events to prevent overfitting
        if (userEvents.length >= 2) {
          await tuneGroup(redis, userEvents, userId);
        } else {
          console.log(`\nSkipped User ${userId}: insufficient telemetry footprint (${userEvents.length} events, min 2 required).`);
        }
      }
    }

    console.log('\n🧠 Closed-loop multi-tenant tuning successfully finalized!');

  } catch (err) {
    console.error(`\n❌ Autotuning execution failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
    await redis.quit();
  }
}

runAutotuner();
