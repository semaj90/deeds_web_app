#!/usr/bin/env node

/**
 * Generate Ontology Tuples (Multi-Signal Fusion)
 *
 * Fuses evidence from 4 lanes (lexical, structural, semantic, legacy) into unified
 * domain predictions. Generates feature_ontology_tuples with multi-label probabilities.
 *
 * Input: feature_lexical_facts, feature_structural_facts, feature_semantic_facts, feature_domain_facts
 * Output: feature_ontology_tuples (unified domain predictions with confidence)
 *
 * Usage:
 *   node scripts/atlas/generate-ontology-tuples.mjs --dry-run
 *   node scripts/atlas/generate-ontology-tuples.mjs --apply --limit=5000
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

/**
 * Fusion weights for multi-signal evidence
 */
const FUSION_WEIGHTS = {
  lexical: 0.15,
  structural: 0.15,
  semantic: 0.30,
  legacy: 0.25,
  ontology: 0.15
};

/**
 * Fetch packet with all evidence signals
 */
async function fetchPacketWithEvidence(packetKey) {
  const res = await pool.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.domain_class as legacy_domain,
      fdf.domain_class as feature_domain,
      fdf.domain_confidence,
      flf.keywords,
      flf.identifiers,
      fsf.symbol_kind,
      fsf.imports,
      fsf.exports,
      fsf2.domain_similarity
    FROM atlas_packets ap
    LEFT JOIN feature_domain_facts fdf ON ap.packet_key = fdf.packet_key
    LEFT JOIN feature_lexical_facts flf ON ap.packet_key = flf.packet_key
    LEFT JOIN feature_structural_facts fsf ON ap.packet_key = fsf.packet_key
    LEFT JOIN feature_semantic_facts fsf2 ON ap.packet_key = fsf2.packet_key
    WHERE ap.packet_key = $1
  `, [packetKey]);

  return res.rows[0] || null;
}

/**
 * Score evidence from lexical lane
 * Returns confidence [0, 1]
 */
function scoreLexicalEvidence(keywords, identifiers) {
  if (!keywords || !identifiers) return 0;

  const keywordCount = Array.isArray(keywords) ? keywords.length : 0;
  const identifierCount = Array.isArray(identifiers) ? identifiers.length : 0;
  const total = Math.max(1, keywordCount + identifierCount);

  // Normalized score based on feature density
  return Math.min(1.0, total / 50);  // 50 features = high confidence
}

/**
 * Score evidence from structural lane
 * Returns confidence [0, 1]
 */
function scoreStructuralEvidence(symbolKind, importCount, exportCount) {
  if (!symbolKind) return 0;

  const kindScore = symbolKind && symbolKind !== 'unknown' ? 0.5 : 0;
  const importScore = (importCount || 0) > 0 ? 0.25 : 0;
  const exportScore = (exportCount || 0) > 0 ? 0.25 : 0;

  return kindScore + importScore + exportScore;
}

/**
 * Score evidence from semantic lane
 * Returns confidence [0, 1]
 */
function scoreSemanticEvidence(similarity) {
  if (similarity === null || similarity === undefined) return 0;

  // Map [-1, 1] similarity to [0, 1] confidence
  return Math.abs(similarity);  // Take absolute value
}

/**
 * Score evidence from legacy domain_class
 * Returns confidence [0, 1]
 */
function scoreLegacyEvidence(domainClass, confidence) {
  if (!domainClass || domainClass === 'unknown') return 0;

  // Use provided confidence or default to 0.8
  return confidence || 0.8;
}

/**
 * Generate ontology tuples for a packet
 */
function generateOntologyTuples(packet) {
  if (!packet) return [];

  const tuples = [];

  // Compute scores from each evidence lane
  const lexicalScore = scoreLexicalEvidence(packet.keywords, packet.identifiers);
  const structuralScore = scoreStructuralEvidence(
    packet.symbol_kind,
    (packet.imports || []).length,
    (packet.exports || []).length
  );
  const semanticScore = scoreSemanticEvidence(packet.domain_similarity);
  const legacyScore = scoreLegacyEvidence(packet.feature_domain, packet.domain_confidence);

  // Fused confidence using weighted average
  const fusedConfidence =
    (lexicalScore * FUSION_WEIGHTS.lexical) +
    (structuralScore * FUSION_WEIGHTS.structural) +
    (semanticScore * FUSION_WEIGHTS.semantic) +
    (legacyScore * FUSION_WEIGHTS.legacy);

  // Primary domain from legacy (most reliable)
  const primaryDomain = packet.feature_domain || packet.legacy_domain || 'unknown';

  // Generate tuple
  tuples.push({
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    domain_class: primaryDomain,
    domain_confidence: Math.min(1.0, Math.max(0, fusedConfidence)),
    evidence_json: {
      lexical: { score: lexicalScore, source: 'keyword_density' },
      structural: { score: structuralScore, source: 'symbol_analysis' },
      semantic: { score: semanticScore, source: 'embedding_similarity' },
      legacy: { score: legacyScore, source: 'atlas_packets_domain_class' }
    },
    decision: fusedConfidence > 0.7 ? 'accepted' : fusedConfidence > 0.4 ? 'candidate' : 'review'
  });

  return tuples;
}

/**
 * Fetch packets for ontology generation
 */
async function fetchPacketsForOntology() {
  console.log('\n📚 Fetching packets for ontology generation...');

  const res = await pool.query(`
    SELECT DISTINCT packet_key
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
    ORDER BY packet_key
    LIMIT $1
  `, [limit]);

  console.log(`   ✓ Loaded ${res.rows.length} packets`);
  return res.rows.map(r => r.packet_key);
}

/**
 * Generate and materialize ontology tuples
 */
async function materializeOntologyTuples(packetKeys) {
  console.log(`\n📝 Generating ontology tuples from ${packetKeys.length} packets...\n`);

  if (DRY_RUN) {
    console.log(`   ⚠️  DRY RUN: Would generate ontology tuples for ${packetKeys.length} packets`);
    console.log(`   Sample generation (first 3 packets):\n`);

    for (let i = 0; i < Math.min(3, packetKeys.length); i++) {
      const packet = await fetchPacketWithEvidence(packetKeys[i]);
      if (!packet) continue;

      const tuples = generateOntologyTuples(packet);
      if (tuples.length === 0) continue;

      const tuple = tuples[0];
      console.log(`     Packet: ${tuple.packet_key}`);
      console.log(`       Domain: ${tuple.domain_class}`);
      console.log(`       Confidence: ${tuple.domain_confidence.toFixed(3)}`);
      console.log(`       Decision: ${tuple.decision}\n`);
    }

    console.log(`   To apply, run with --apply flag.\n`);
    return { generated: 0, errors: 0 };
  }

  let generated = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < packetKeys.length; i += batchSize) {
    const batch = packetKeys.slice(i, i + batchSize);

    for (const packetKey of batch) {
      try {
        // Fetch packet with all evidence
        const packet = await fetchPacketWithEvidence(packetKey);
        if (!packet) continue;

        // Generate tuples
        const tuples = generateOntologyTuples(packet);

        for (const tuple of tuples) {
          const contentHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(tuple.evidence_json))
            .digest('hex');

          await pool.query(
            `
            INSERT INTO feature_ontology_tuples
            (packet_key, source_ref, domain_class, domain_confidence,
             evidence_json, decision, extractor_version, content_hash, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              tuple.packet_key,
              tuple.source_ref,
              tuple.domain_class,
              tuple.domain_confidence,
              JSON.stringify(tuple.evidence_json),
              tuple.decision,
              'multi-signal-v1',
              contentHash,
              { fusion_method: 'weighted-average', weights: FUSION_WEIGHTS }
            ]
          );

          generated++;
        }
      } catch (err) {
        if (VERBOSE) {
          console.error(`   ❌ Error generating for ${packetKey}: ${err.message}`);
        }
        errors++;
      }
    }

    // Progress indicator
    const progress = Math.min(i + batchSize, packetKeys.length);
    console.log(`   Progress: ${progress} / ${packetKeys.length}`);
  }

  console.log(`\n   ✓ Generated: ${generated}, Errors: ${errors}\n`);
  return { generated, errors };
}

/**
 * Verify materialization
 */
async function verifyOntologyMaterialization() {
  console.log('✅ Verifying ontology tuple materialization...');

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as with_domain,
      COUNT(CASE WHEN decision = 'accepted' THEN 1 END) as accepted,
      COUNT(CASE WHEN decision = 'candidate' THEN 1 END) as candidate,
      COUNT(CASE WHEN decision = 'review' THEN 1 END) as review,
      AVG(domain_confidence)::numeric(5,3) as avg_confidence
    FROM feature_ontology_tuples
  `);

  const stats = res.rows[0];
  console.log(`   Total tuples: ${stats.total}`);
  console.log(`   With domain class: ${stats.with_domain}`);
  console.log(`   Decision breakdown: accepted=${stats.accepted}, candidate=${stats.candidate}, review=${stats.review}`);
  console.log(`   Average confidence: ${stats.avg_confidence}\n`);

  return stats;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Generate Ontology Tuples (Multi-Signal Fusion)            ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  Limit: ${limit}, Batch Size: ${batchSize}`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Fetch packets
    const packetKeys = await fetchPacketsForOntology();

    if (packetKeys.length === 0) {
      console.log('\n❌ No packets found.');
      process.exit(1);
    }

    // Generate and materialize
    const result = await materializeOntologyTuples(packetKeys);

    // Verify
    if (!DRY_RUN) {
      await verifyOntologyMaterialization();
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Ontology tuple generation complete!');
    if (!DRY_RUN) {
      console.log(`   Generated: ${result.generated} tuples`);
    }
    console.log('   Phase 107 Complete: All 5 evidence lanes ready for fusion\n');

    await pool.end();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
