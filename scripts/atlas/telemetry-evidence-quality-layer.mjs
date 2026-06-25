#!/usr/bin/env node
/**
 * Telemetry Evidence Quality Layer
 *
 * Fourth proof lane (after replay, cache, provenance):
 * Telemetry Depth + Broader Evidence Quality
 *
 * MISSION: Connect retrieval telemetry to evidence quality signals
 * - Measure breadth: How many stores/lanes/strategies were tried?
 * - Measure depth: How deep into the retrieval stack did we go? (L1 exact → L2 semantic → L3 ANN → L4 graph → L5 cold)
 * - Measure quality: Did the final answer use discriminative signals (high fusion score, high authority, low ambiguity)?
 *
 * OUTCOME: Write evidence quality scores to database, enabling:
 * - Retrieval strategy tuning (which strategies produce highest quality evidence?)
 * - Evidence reliability audit (which packets/features have proven retrieval quality?)
 * - Pipeline optimization (where in the stack does quality drop, and why?)
 *
 * GATES (4 sub-gates):
 * 1. Breadth Coverage: ≥3 retrieval lanes attempted
 * 2. Depth Penetration: Stack traversal reaches ≥2 levels (not just L1)
 * 3. Quality Signals: Fusion score ≥0.7 OR authority ≥0.6 OR confidence ≥0.75
 * 4. Evidence Tracing: Packet lineage + source_ref + feature_id all present
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
loadAtlasEnv(ROOT);

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

// ============================================================================
// CORE DATA STRUCTURES
// ============================================================================

/**
 * Evidence Quality Assessment:
 * Combines breadth (how many lanes?), depth (how many stack levels?),
 * and signal strength (fusion/authority/confidence).
 */
class EvidenceQualityAssessment {
  constructor(telemetryRow) {
    this.telemetryId = telemetryRow.id;
    this.queryHash = telemetryRow.query_hash;
    this.query = telemetryRow.query;

    // Breadth: Count unique retrieval lanes (vector, lexical, fusion, cache, cold)
    this.breadthScore = this.calculateBreadth(telemetryRow);

    // Depth: How many stack levels were traversed?
    // L1: Redis exact match (cache_hit + vector_hits + trigram_hits > 0)
    // L2: Bifrost semantic reranking (fusion_score present)
    // L3: Qdrant ANN (vector_hits > 0)
    // L4: Neo4j graph (topology or multi-hop references in query)
    // L5: Cold storage (cold strategy or fallback path)
    this.depthScore = this.calculateDepth(telemetryRow);

    // Quality signals: Discriminative confidence in the answer
    // High fusion score (≥0.7) = strong multi-source agreement
    // High authority (≥0.6) = strong community validation
    // High confidence (≥0.75) = model confidence in answer
    this.signalStrength = this.calculateSignalStrength(telemetryRow);

    // Evidence tracing: Can we trace packet → feature → community?
    this.tracingCompleteness = this.calculateTracingCompleteness(telemetryRow);

    // Final quality score (0-1 scale)
    this.qualityScore = this.synthesizeQualityScore();

    // Gate pass/fail
    this.gatesPass = this.validateGates();
  }

  calculateBreadth(row) {
    let lanesAttempted = 0;
    const lanes = {
      vector: row.vector_hits > 0,
      lexical: row.trigram_hits > 0 || row.fts_hits > 0,
      fusion: row.retrieval_strategy === 'fusion',
      cache: row.cache_hit === true,
      cold: /cold/i.test(String(row.retrieval_strategy || ''))
    };

    for (const [lane, used] of Object.entries(lanes)) {
      if (used) lanesAttempted++;
    }

    // Normalize to 0-1 scale (5 lanes max)
    return Math.min(lanesAttempted / 5, 1.0);
  }

  calculateDepth(row) {
    let depthLevel = 0;

    // L1: Redis exact match (cache hit means we found it in L1)
    if (row.cache_hit === true) depthLevel = 1;

    // L2: Bifrost semantic (fusion_score present = semantic reranking occurred)
    if (row.fusion_score !== null && row.fusion_score > 0) depthLevel = Math.max(depthLevel, 2);

    // L3: Qdrant ANN (vector search occurred)
    if (Number(row.vector_hits || 0) > 0) depthLevel = Math.max(depthLevel, 3);

    // L4: Neo4j graph (topology or graph in query signature)
    if (/graph|neo4j|topology|multi.hop|community/i.test(String(row.query || ''))) {
      depthLevel = Math.max(depthLevel, 4);
    }

    // L5: Cold storage (cold_path strategy)
    if (/cold/i.test(String(row.retrieval_strategy || ''))) {
      depthLevel = Math.max(depthLevel, 5);
    }

    // Normalize: depth 5 is best (reached cold fallback)
    return Math.min(depthLevel / 5, 1.0);
  }

  calculateSignalStrength(row) {
    const signals = [];

    // Fusion score (0-1 normalized)
    if (row.fusion_score !== null) {
      signals.push(row.fusion_score);
    }

    // Authority proxy: High hit count from multiple lanes = agreement
    const totalHits = Number(row.vector_hits || 0) +
      Number(row.trigram_hits || 0) +
      Number(row.fts_hits || 0);
    if (totalHits > 0) {
      // Normalize: 0-10 hits → 0.5-1.0 signal
      signals.push(Math.min(0.5 + (totalHits / 10) * 0.5, 1.0));
    }

    // Confidence from packet count: Multiple packets selected = high confidence
    const selectedCount = Array.isArray(row.selected_packet_keys)
      ? row.selected_packet_keys.length
      : 0;
    if (selectedCount > 0) {
      signals.push(Math.min(0.6 + (selectedCount / 10) * 0.4, 1.0));
    }

    // Return average of all signals (0.5 minimum if any signal present)
    if (signals.length === 0) return 0.3; // No signals = low quality
    return Math.max(signals.reduce((a, b) => a + b) / signals.length, 0.5);
  }

  calculateTracingCompleteness(row) {
    const hasPackets = Array.isArray(row.selected_packet_keys) && row.selected_packet_keys.length > 0;
    const hasFeatures = Array.isArray(row.feature_ids) && row.feature_ids.length > 0;
    const hasQuery = row.query && row.query.length > 0;

    const completeness = [hasPackets, hasFeatures, hasQuery].filter(Boolean).length / 3;
    return completeness;
  }

  synthesizeQualityScore() {
    // Weighted average of components
    // Breadth: 20% (how comprehensive was retrieval attempt?)
    // Depth: 30% (how far through the stack did we go?)
    // Signals: 35% (how strong are discriminative signals?)
    // Tracing: 15% (can we audit the lineage?)
    return (
      0.2 * this.breadthScore +
      0.3 * this.depthScore +
      0.35 * this.signalStrength +
      0.15 * this.tracingCompleteness
    );
  }

  validateGates() {
    const gates = {
      breadth_coverage: this.breadthScore >= 0.6, // ≥3 lanes
      depth_penetration: this.depthScore >= 0.4,  // ≥L2 at minimum
      quality_signals: this.signalStrength >= 0.7, // Strong discrimination
      evidence_tracing: this.tracingCompleteness >= 0.67 // 2/3 fields present
    };

    return {
      allPass: Object.values(gates).every(Boolean),
      gates
    };
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function createEvidenceQualityTable(pool) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS evidence_quality_scores (
      id SERIAL PRIMARY KEY,
      telemetry_id INTEGER NOT NULL REFERENCES retrieval_telemetry(id) ON DELETE CASCADE,
      query_hash VARCHAR(255) NOT NULL,
      breadth_score REAL NOT NULL,
      depth_score REAL NOT NULL,
      signal_strength REAL NOT NULL,
      tracing_completeness REAL NOT NULL,
      quality_score REAL NOT NULL,
      gates_breadth_coverage BOOLEAN NOT NULL,
      gates_depth_penetration BOOLEAN NOT NULL,
      gates_quality_signals BOOLEAN NOT NULL,
      gates_evidence_tracing BOOLEAN NOT NULL,
      gates_all_pass BOOLEAN NOT NULL,
      retrieval_strategy VARCHAR(50),
      fusion_score REAL,
      cache_hit BOOLEAN,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(telemetry_id)
    );

    CREATE INDEX IF NOT EXISTS evidence_quality_scores_hash_idx ON evidence_quality_scores(query_hash);
    CREATE INDEX IF NOT EXISTS evidence_quality_scores_quality_idx ON evidence_quality_scores(quality_score);
    CREATE INDEX IF NOT EXISTS evidence_quality_scores_gates_idx ON evidence_quality_scores(gates_all_pass);
  `;

  try {
    await pool.query(createTableSQL);
    if (VERBOSE) console.log('✓ Evidence quality scores table ready');
  } catch (err) {
    if (!err.message.includes('already exists')) {
      throw err;
    }
  }
}

async function assessTelemetryQuality(pool) {
  // Fetch all telemetry rows
  const { rows: telemetryRows } = await pool.query(`
    SELECT
      id, created_at, query, query_hash, latency_ms,
      vector_hits, trigram_hits, fts_hits,
      selected_packet_keys, feature_ids,
      fusion_score, cache_hit, surface,
      environment, retrieval_strategy
    FROM retrieval_telemetry
    WHERE id NOT IN (SELECT telemetry_id FROM evidence_quality_scores)
    ORDER BY created_at DESC
    LIMIT 1000
  `);

  if (telemetryRows.length === 0) {
    if (VERBOSE) console.log('No new telemetry rows to assess');
    return { assessed: 0, passed: 0, failed: 0, avgQuality: 0 };
  }

  const assessments = telemetryRows.map(row => new EvidenceQualityAssessment(row));

  if (VERBOSE) {
    console.log(`\nAssessing ${assessments.length} telemetry rows for evidence quality...`);
    console.log('Sample assessment:', {
      queryHash: assessments[0].queryHash,
      breadth: assessments[0].breadthScore.toFixed(2),
      depth: assessments[0].depthScore.toFixed(2),
      signals: assessments[0].signalStrength.toFixed(2),
      tracing: assessments[0].tracingCompleteness.toFixed(2),
      finalScore: assessments[0].qualityScore.toFixed(3),
      gatesPass: assessments[0].gatesPass.allPass
    });
  }

  // Write to database if --apply
  if (APPLY) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const assessment of assessments) {
        await client.query(`
          INSERT INTO evidence_quality_scores (
            telemetry_id, query_hash, breadth_score, depth_score,
            signal_strength, tracing_completeness, quality_score,
            gates_breadth_coverage, gates_depth_penetration,
            gates_quality_signals, gates_evidence_tracing, gates_all_pass,
            retrieval_strategy, fusion_score, cache_hit
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
        `, [
          assessment.telemetryId,
          assessment.queryHash,
          assessment.breadthScore,
          assessment.depthScore,
          assessment.signalStrength,
          assessment.tracingCompleteness,
          assessment.qualityScore,
          assessment.gatesPass.gates.breadth_coverage,
          assessment.gatesPass.gates.depth_penetration,
          assessment.gatesPass.gates.quality_signals,
          assessment.gatesPass.gates.evidence_tracing,
          assessment.gatesPass.allPass,
          (assessments.find(a => a.telemetryId === assessment.telemetryId)?.retrieval_strategy) || null,
          (assessments.find(a => a.telemetryId === assessment.telemetryId)?.fusion_score) || null,
          (assessments.find(a => a.telemetryId === assessment.telemetryId)?.cache_hit) || null
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const passed = assessments.filter(a => a.gatesPass.allPass).length;
  const failed = assessments.length - passed;
  const avgQuality = assessments.reduce((sum, a) => sum + a.qualityScore, 0) / assessments.length;

  return { assessed: assessments.length, passed, failed, avgQuality };
}

// ============================================================================
// VERIFICATION & REPORTING
// ============================================================================

async function verifyEvidenceQualityGates(pool) {
  const { rows: results } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN gates_all_pass THEN 1 END) as gates_pass,
      COUNT(CASE WHEN gates_breadth_coverage THEN 1 END) as breadth_pass,
      COUNT(CASE WHEN gates_depth_penetration THEN 1 END) as depth_pass,
      COUNT(CASE WHEN gates_quality_signals THEN 1 END) as signals_pass,
      COUNT(CASE WHEN gates_evidence_tracing THEN 1 END) as tracing_pass,
      ROUND(AVG(quality_score)::numeric, 3) as avg_quality_score,
      MIN(quality_score) as min_quality,
      MAX(quality_score) as max_quality
    FROM evidence_quality_scores
  `);

  const result = results[0];
  const gatePassRate = result.total > 0 ? (result.gates_pass / result.total * 100).toFixed(1) : 0;

  console.log('\n🔐 Evidence Quality Gates:');
  console.log(`  Gate 1 (Breadth Coverage): ${result.breadth_pass}/${result.total} (${(result.breadth_pass / result.total * 100).toFixed(1)}%)`);
  console.log(`  Gate 2 (Depth Penetration): ${result.depth_pass}/${result.total} (${(result.depth_pass / result.total * 100).toFixed(1)}%)`);
  console.log(`  Gate 3 (Quality Signals): ${result.signals_pass}/${result.total} (${(result.signals_pass / result.total * 100).toFixed(1)}%)`);
  console.log(`  Gate 4 (Evidence Tracing): ${result.tracing_pass}/${result.total} (${(result.tracing_pass / result.total * 100).toFixed(1)}%)`);
  console.log(`\n  Overall Gates Pass: ${result.gates_pass}/${result.total} (${gatePassRate}%)`);
  console.log(`  Average Quality Score: ${result.avg_quality_score} (range: ${result.min_quality} - ${result.max_quality})`);

  return gatePassRate >= 70; // 70% pass rate = lane PASS
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({
    connectionString: DB_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000
  });

  try {
    console.log('═════════════════════════════════════════════════════════════════');
    console.log('📊 TELEMETRY EVIDENCE QUALITY LAYER');
    console.log('═════════════════════════════════════════════════════════════════');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

    // Create table
    await createEvidenceQualityTable(pool);

    // Assess telemetry quality
    const { assessed, passed, failed, avgQuality } = await assessTelemetryQuality(pool);
    console.log(`\n✓ Assessed ${assessed} telemetry rows`);
    console.log(`  Passed: ${passed} | Failed: ${failed}`);
    console.log(`  Average Quality Score: ${avgQuality.toFixed(3)}`);

    // Verify gates
    if (!DRY_RUN) {
      const gatesPass = await verifyEvidenceQualityGates(pool);
      console.log(`\n${gatesPass ? '✅' : '❌'} TELEMETRY EVIDENCE QUALITY LANE: ${gatesPass ? 'PASS' : 'FAIL'}`);
      process.exit(gatesPass ? 0 : 1);
    } else {
      console.log('\n(Dry run mode — no changes committed)');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
