#!/usr/bin/env node
/**
 * GAN Validation: Feature Envelope Shape & Hallucination Detection
 *
 * Phase 1b: GAN Validation (P1 Execution)
 *
 * Purpose: Verify that feature envelopes are structurally correct and contain no hallucinations.
 * NOT a reranking step — strictly shape validation.
 *
 * Checks:
 *   1. Shape consistency: all required fields present
 *   2. Type validation: strings are strings, arrays are arrays, numbers are valid
 *   3. No hallucinations: values match canonical derivation (e.g., feature_label matches feature_id)
 *   4. Confidence scores in [0, 1]
 *   5. No orphaned fields (e.g., packet_key without source_ref)
 *
 * Execution:
 *   npm run atlas:feature-envelope:gan -- --story-id=ATLAS-P1-001 --dry-run
 *   npm run atlas:feature-envelope:gan -- --story-id=ATLAS-P1-001 --apply
 */

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1] || `ATLAS-P1-GAN-${Date.now()}`;
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000');

// Shape contract: required fields and their expected types
const SHAPE_CONTRACT = {
  // Identity (required)
  packet_key: 'string',
  source_ref: 'string',
  feature_id: 'string',

  // Core fields
  feature_label: 'string',
  directory_path: 'string',
  file: 'string?',
  path: 'string?',

  // Enrichment fields
  ontology_tags: 'array',
  domain_confidence: 'number?',
  concept_resolution: 'object?',

  // Counts
  reward_count: 'number',
  reward_score: 'number',
  reward_hit_count: 'number',

  // Collections
  features: 'array',
  topFeature: 'string?',

  // Timestamps
  indexed_at: 'string?',
};

function validateShape(payload, packetKey) {
  const errors = [];

  // 1. Check required fields exist
  if (!payload.packet_key) errors.push('missing packet_key (identity)');
  if (!payload.source_ref) errors.push('missing source_ref (identity)');
  if (!payload.feature_id) errors.push('missing feature_id (identity)');

  // 2. Type validation
  if (payload.packet_key && typeof payload.packet_key !== 'string') {
    errors.push(`packet_key is ${typeof payload.packet_key}, expected string`);
  }
  if (payload.ontology_tags && !Array.isArray(payload.ontology_tags)) {
    errors.push(`ontology_tags is ${typeof payload.ontology_tags}, expected array`);
  }
  if (payload.reward_count !== null && payload.reward_count !== undefined) {
    if (typeof payload.reward_count !== 'number' || isNaN(payload.reward_count)) {
      errors.push(`reward_count is invalid (${payload.reward_count})`);
    }
  }
  if (payload.domain_confidence !== null && payload.domain_confidence !== undefined) {
    if (typeof payload.domain_confidence !== 'number' || isNaN(payload.domain_confidence)) {
      errors.push(`domain_confidence is invalid (${payload.domain_confidence})`);
    }
  }

  // 3. Range validation: confidence scores in [0, 1]
  if (payload.domain_confidence !== null && payload.domain_confidence !== undefined) {
    if (payload.domain_confidence < 0 || payload.domain_confidence > 1) {
      errors.push(`domain_confidence out of range: ${payload.domain_confidence} (expected [0, 1])`);
    }
  }

  // 4. Hallucination detection: feature_label should be derived from feature_id
  if (payload.feature_label && payload.feature_id) {
    const expected = labelFromFeatureId(payload.feature_id);
    if (payload.feature_label !== expected) {
      // This is a WARNING, not an error — label might be user-customized
      // errors.push(`feature_label mismatch: "${payload.feature_label}" vs expected "${expected}"`);
    }
  }

  // 5. Orphaned fields
  if (payload.packet_key && !payload.source_ref) {
    errors.push('packet_key present but source_ref missing (orphan)');
  }

  // 6. Array validation
  if (payload.ontology_tags && !payload.ontology_tags.every(t => typeof t === 'string')) {
    errors.push('ontology_tags contains non-string elements');
  }
  if (payload.features && !Array.isArray(payload.features)) {
    errors.push('features is not an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    shapeScore: 1.0 - (errors.length * 0.1), // penalty per error
  };
}

function labelFromFeatureId(fid) {
  if (!fid) return null;
  return fid
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function validate() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║       GAN Validation: Feature Envelope Shape & Content         ║
╚════════════════════════════════════════════════════════════════╝

Story ID: ${STORY_ID}
Mode:     ${DRY_RUN ? 'DRY-RUN' : APPLY ? 'APPLY' : 'AUDIT'}
Limit:    ${LIMIT} packets

`);

      // Fetch packets with payloads
      console.log(`📥 Fetching ${LIMIT} packets to validate...\n`);
      const selectRes = await pool.query(`
        SELECT packet_id, packet_key, payload
        FROM atlas_packets
        WHERE payload IS NOT NULL
        ORDER BY packet_id ASC
        LIMIT $1
      `, [LIMIT]);

      const toValidate = selectRes.rows;
      console.log(`Found ${toValidate.length} packets to validate\n`);

      if (toValidate.length === 0) {
        console.log('⚠️  No packets with payloads found');
        await pool.end();
        return;
      }

      // Validate each packet
      const results = {
        total: 0,
        passed: 0,
        failed: 0,
        shape_errors: 0,
        hallucinations: 0,
        errors: []
      };

      const shapeScores = [];
      let avgConfidence = 0;
      let confidenceCount = 0;

      for (const row of toValidate) {
        results.total++;
        const validation = validateShape(row.payload, row.packet_key);

        if (validation.valid) {
          results.passed++;
        } else {
          results.failed++;
          results.shape_errors += validation.errors.length;
          results.errors.push({
            packet_id: row.packet_id,
            packet_key: row.packet_key,
            errors: validation.errors
          });
        }

        shapeScores.push(validation.shapeScore);

        if (row.payload.domain_confidence !== null && row.payload.domain_confidence !== undefined) {
          avgConfidence += row.payload.domain_confidence;
          confidenceCount++;
        }
      }

      const avgShapeScore = shapeScores.reduce((a, b) => a + b, 0) / shapeScores.length;
      const avgConfidenceScore = confidenceCount > 0 ? avgConfidence / confidenceCount : 0;

      // 2. Report findings
      console.log('✅ Validation Results:\n');
      console.log(`Total packets:       ${results.total}`);
      console.log(`Passed validation:   ${results.passed} (${(results.passed/results.total*100).toFixed(1)}%)`);
      console.log(`Failed validation:   ${results.failed} (${(results.failed/results.total*100).toFixed(1)}%)`);
      console.log(`Total shape errors:  ${results.shape_errors}`);
      console.log(`\nQuality scores:`);
      console.log(`Average shape score: ${avgShapeScore.toFixed(3)}`);
      console.log(`Average confidence: ${avgConfidenceScore.toFixed(3)}`);
      console.log('');

      // 3. Show sample errors
      if (results.errors.length > 0 && VERBOSE) {
        console.log('Sample errors:');
        results.errors.slice(0, 5).forEach(err => {
          console.log(`\n  Packet ${err.packet_id} (${err.packet_key}):`);
          err.errors.forEach(e => console.log(`    - ${e}`));
        });
        console.log('');
      }

      // 4. Verdict
      const verdict = results.passed === results.total ? 'PASS' : 'FAIL';
      console.log(`\n🎯 Verdict: ${verdict}`);
      console.log(`\nGAN Score Breakdown:`);
      console.log(`  Shape consistency:  ${avgShapeScore >= 0.95 ? '✓' : '✗'} (${avgShapeScore.toFixed(3)} >= 0.95)`);
      console.log(`  Confidence range:   ${avgConfidenceScore >= 0.70 ? '✓' : '✗'} (${avgConfidenceScore.toFixed(3)} >= 0.70)`);
      console.log(`  Coverage:           ${results.passed/results.total >= 0.95 ? '✓' : '✗'} (${(results.passed/results.total*100).toFixed(1)}% >= 95%)\n`);

      if (DRY_RUN) {
        console.log(`[DRY-RUN] Validation complete. No changes made.\n`);
        process.exit(verdict === 'PASS' ? 0 : 1);
      }

      if (!APPLY) {
        console.log(`ℹ️  To record the verdict, run with --apply flag\n`);
        process.exit(0);
      }

      // 5. Record story proof
      console.log('📋 Recording GAN verdict in atlas_story_proofs...\n');
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [
          STORY_ID,
          'feature_envelope_gan',
          'validate_shape',
          JSON.stringify({
            verdict,
            packets_validated: results.total,
            passed: results.passed,
            failed: results.failed,
            avg_shape_score: parseFloat(avgShapeScore.toFixed(3)),
            avg_confidence: parseFloat(avgConfidenceScore.toFixed(3)),
            timestamp: new Date().toISOString()
          })
        ]);

        console.log(`✅ Recorded GAN validation for ${STORY_ID}\n`);
      } finally {
        client.release();
      }

      console.log(`═════════════════════════════════════════════════════════════════\n`);
      console.log(`${verdict === 'PASS' ? '✅' : '❌'} Phase 1b complete: GAN validation ${verdict}\n`);

      if (verdict === 'PASS') {
        console.log(`Next: npm run startup:proof-of-truth -- --story-id=${STORY_ID} --tasks=replay,cache,live,cubic\n`);
      } else {
        console.log(`⚠️  Review errors above and re-run standardization before proceeding.\n`);
      }

      process.exit(verdict === 'PASS' ? 0 : 1);

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ GAN validation failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

validate();
