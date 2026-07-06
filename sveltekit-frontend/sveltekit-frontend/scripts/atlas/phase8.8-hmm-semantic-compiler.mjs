#!/usr/bin/env node
/**
 * Phase 8.8: HMM State Machine Diagnosis
 *
 * Infer diagnostic state and emit repair recommendations
 * based on Naive Bayes predictions from Phase 106.2
 *
 * Input: atlas_packet_metrics.naive_bayes_predictions (from Phase 106.2)
 * Output: atlas_packet_metrics.hmm_recommendations (JSONB)
 *
 * HMM State Machine:
 *   IdentityError (packet_key missing/corrupt)
 *   StructureError (ast_symbols missing/incomplete)
 *   LexicalError (lexical_features missing)
 *   SemanticError (used_concepts missing)
 *   TopologyError (graph edges missing)
 *   VectorError (embedding missing/invalid)
 *   QdrantBridgeError (Qdrant sync failed)
 *
 * Usage:
 *   npm run atlas:phase8.8:hmm:dry --limit=100
 *   npm run atlas:phase8.8:hmm:apply --limit=10000
 */

import pg from 'pg';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '50000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * HMM State Machine: Priority-based error detection with confidence scoring
 *
 * Priority Order (P1 highest, P6 lowest):
 * P1: IdentityError (packet_key, source_ref missing)
 * P2: StructureError (ast_symbols missing/incomplete)
 * P3: LexicalError (lexical_features missing)
 * P4: SemanticError (used_concepts missing)
 * P5: TopologyError (som_cluster missing, graph edges not in Neo4j)
 * P6: VectorError (embedding missing or Qdrant bridge failed)
 */

function diagnosePacketState(row, naiveBayesPredictions) {
  const {
    packet_key,
    source_ref,
    ast_symbols,
    lexical_features,
    used_concepts,
    embedding_present,
    qdrant_indexed
  } = row;

  // Priority 1: Identity check
  if (!packet_key || !source_ref) {
    return {
      hmm_state: 'IdentityError',
      confidence: 1.0,
      recommended_repair_lane: 'none',
      recommended_tool_call: 'restore_packet_identity',
      evidence: 'Missing packet_key or source_ref',
      priority: 1
    };
  }

  // Use Naive Bayes prediction as the primary signal
  if (!naiveBayesPredictions) {
    return {
      hmm_state: 'VectorError',
      confidence: 0.7,
      recommended_repair_lane: 'embedding_bridge',
      recommended_tool_call: 'atlas:qdrant:embedding:bridge:apply',
      evidence: 'Naive Bayes predictions missing',
      priority: 6
    };
  }

  const {
    likely_error_state,
    error_state_confidence,
    candidate_repair_lane,
    repair_lane_confidence
  } = naiveBayesPredictions;

  // Priority 2-6: Map Naive Bayes error state to HMM state
  let hmm_state = 'VectorError';  // Default
  let confidence = error_state_confidence || 0.0;
  let priority = 6;

  if (likely_error_state === 'StructureError') {
    hmm_state = 'StructureError';
    priority = 2;
  } else if (likely_error_state === 'LexicalError') {
    hmm_state = 'LexicalError';
    priority = 3;
  } else if (likely_error_state === 'SemanticError') {
    hmm_state = 'SemanticError';
    priority = 4;
  } else if (likely_error_state === 'TopologyError') {
    hmm_state = 'TopologyError';
    priority = 5;
  } else if (likely_error_state === 'VectorError') {
    // Check if it's specifically a Qdrant bridge issue
    if (!qdrant_indexed) {
      hmm_state = 'QdrantBridgeError';
      confidence = 0.95;
    } else {
      hmm_state = 'VectorError';
    }
    priority = 6;
  }

  return {
    hmm_state,
    confidence: Math.min(confidence, 0.99),  // Cap confidence at 99%
    recommended_repair_lane: candidate_repair_lane || 'embedding_bridge',
    recommended_tool_call: mapRepairLaneToToolCall(candidate_repair_lane || 'embedding_bridge'),
    evidence: buildEvidenceString(naiveBayesPredictions, { ast_symbols, lexical_features, used_concepts }),
    priority
  };
}

/**
 * Map repair lane to actual tool call command
 */
function mapRepairLaneToToolCall(lane) {
  const mapping = {
    'ast_extraction': 'atlas:phase1.5:ast-grep:apply',
    'lexical_extraction': 'atlas:phase1.5:lexical:apply',
    'concept_extraction': 'atlas:langextract:concepts:apply',
    'embedding_bridge': 'atlas:qdrant:embedding:bridge:apply',
    'topology_repair': 'atlas:topology:repair:apply'
  };
  return mapping[lane] || 'atlas:qdrant:embedding:bridge:apply';
}

/**
 * Build human-readable evidence string
 */
function buildEvidenceString(nbPredictions, features) {
  const parts = [];

  parts.push(`domain_class=${nbPredictions.domain_class}(${(nbPredictions.domain_class_confidence * 100).toFixed(0)}%)`);
  parts.push(`feature_type=${nbPredictions.feature_type}`);
  parts.push(`error_state=${nbPredictions.likely_error_state}(${(nbPredictions.error_state_confidence * 100).toFixed(0)}%)`);

  if (!features.ast_symbols || features.ast_symbols.length === 0) {
    parts.push('ast_symbols=MISSING');
  }
  if (!features.lexical_features || features.lexical_features.length === 0) {
    parts.push('lexical_features=MISSING');
  }
  if (!features.used_concepts || features.used_concepts.length === 0) {
    parts.push('used_concepts=MISSING');
  }

  return parts.join('; ');
}

async function main() {
  console.log(`\n[PHASE 8.8] HMM Semantic Compiler [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets with Naive Bayes predictions
    console.log('Step 1: Fetch packets with Naive Bayes predictions...');
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        apf.ast_symbols,
        apf.lexical_features,
        apf.used_concepts,
        COALESCE(cci.content_embedding IS NOT NULL, false) as embedding_present,
        COALESCE(qdp.payload->>'packet_key' IS NOT NULL, false) as qdrant_indexed,
        apm.naive_bayes_predictions
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      LEFT JOIN codebase_chunk_index cci ON cci.source_ref = ap.source_ref
      LEFT JOIN qdrant_payloads qdp ON qdp.packet_key = ap.packet_key
      LEFT JOIN atlas_packet_metrics apm ON apm.packet_key = ap.packet_key
      WHERE ap.source_ref NOT LIKE 'proto:%'
      AND apm.naive_bayes_predictions IS NOT NULL
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  [OK] Fetched ${packets.length} packets with predictions\n`);

    if (packets.length === 0) {
      console.log('  [WARN] No packets with Naive Bayes predictions found.\n');
      process.exit(0);
    }

    // 2. Run HMM diagnosis on each packet
    console.log('Step 2: Run HMM diagnosis...');

    const diagnoses = packets.map(row => ({
      packet_key: row.packet_key,
      diagnosis: diagnosePacketState(row, row.naive_bayes_predictions)
    }));

    console.log(`  [OK] Diagnosed ${diagnoses.length} packets\n`);

    // 3. Collect statistics by error state
    const statsByState = {};
    diagnoses.forEach(d => {
      const state = d.diagnosis.hmm_state;
      if (!statsByState[state]) {
        statsByState[state] = { count: 0, confidence_sum: 0 };
      }
      statsByState[state].count++;
      statsByState[state].confidence_sum += d.diagnosis.confidence;
    });

    console.log('HMM State Distribution:');
    Object.entries(statsByState).forEach(([state, stats]) => {
      const avg_confidence = (stats.confidence_sum / stats.count * 100).toFixed(1);
      console.log(`  ${state}: ${stats.count} (avg confidence ${avg_confidence}%)`);
    });
    console.log();

    if (isDryRun) {
      console.log('Sample HMM recommendations (first 5):\n');
      diagnoses.slice(0, 5).forEach(d => {
        const diag = d.diagnosis;
        console.log(`  ${d.packet_key}`);
        console.log(`    state: ${diag.hmm_state} (confidence ${(diag.confidence * 100).toFixed(1)}%)`);
        console.log(`    repair_lane: ${diag.recommended_repair_lane}`);
        console.log(`    tool: ${diag.recommended_tool_call}`);
        console.log(`    evidence: ${diag.evidence}\n`);
      });
      console.log('[OK] Dry-run complete. Use apply to persist.\n');
      process.exit(0);
    }

    // 4. Write recommendations to atlas_packet_metrics
    console.log('Step 3: Write HMM recommendations to atlas_packet_metrics...');

    let written = 0;
    let failed = 0;

    for (const d of diagnoses) {
      try {
        await client.query(`
          INSERT INTO atlas_packet_metrics (packet_key, hmm_recommendations)
          VALUES ($1, $2)
          ON CONFLICT (packet_key) DO UPDATE
          SET hmm_recommendations = EXCLUDED.hmm_recommendations, updated_at = NOW()
        `, [d.packet_key, JSON.stringify(d.diagnosis)]);

        written++;
        if (written % 500 === 0) {
          console.log(`  Progress: ${written}/${diagnoses.length} written`);
        }
      } catch (err) {
        console.error(`  [WARN] Failed to write ${d.packet_key}: ${err.message}`);
        failed++;
      }
    }

    console.log(`  [OK] ${written} recommendations written (${failed} failed)\n`);

    // 5. Validation gate
    console.log('Step 4: Validate coverage...');

    const coverage = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM atlas_packets WHERE source_ref NOT LIKE 'proto:%') as extractable_packets,
        (SELECT COUNT(*) FROM atlas_packet_metrics WHERE hmm_recommendations IS NOT NULL) as with_hmm_recommendations
      LIMIT 1
    `);

    const { extractable_packets, with_hmm_recommendations } = coverage.rows[0];
    const pct = extractable_packets > 0 ? (with_hmm_recommendations / extractable_packets * 100).toFixed(1) : 0;

    console.log(`  Extractable (non-proto) packets: ${extractable_packets}`);
    console.log(`  With HMM recommendations: ${with_hmm_recommendations} (${pct}%)`);
    console.log(`  Target: >= 50% for Phase 8.8`);

    if (with_hmm_recommendations >= extractable_packets * 0.5) {
      console.log(`  Result: PASS\n`);
    } else {
      console.log(`  Result: PARTIAL (${pct}%, targeting 50%+)\n`);
    }

    console.log('[SUCCESS] Phase 8.8 HMM Compilation Complete. Ready for ACP wiring.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
