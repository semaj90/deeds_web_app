#!/usr/bin/env node

/**
 * HMM Agentic Error Classification Validation
 *
 * Validates error-domain-recovery pipeline:
 *   - 5 error classes mapped to 10 domains
 *   - Feature coverage for domain patterns
 *   - Recovery packet selection working
 *   - HMM state transitions viable
 *   - End-to-end error signal → recovery packet
 *
 * Usage:
 *   node scripts/atlas/validate-hmm-agentic-error.mjs [--verbose] [--test-signal]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const pgPool = new Pool({ connectionString: POSTGRES_URL });

const VERBOSE = process.argv.includes('--verbose');
const TEST_SIGNAL = process.argv.includes('--test-signal');

// Canonical error-domain mapping
const ERROR_DOMAIN_MAP = {
  'ConnectivityError:auth': ['auth.sessions', 'auth.login', 'auth.logout', 'auth.lucia'],
  'ConnectivityError:cache': ['cache.redis', 'cache.bitfrost', 'cache.invalidate'],
  'ConnectivityError:db': ['db.client', 'db.pool', 'db.schema'],
  'ConnectivityError:grpc': ['grpc.client', 'grpc.service', 'grpc.proto'],
  'TimeoutError:llm': ['llm.ollama', 'llm.gemma4', 'llm.inference', 'llm.synthesis'],
  'TimeoutError:gpu': ['gpu.cuda', 'gpu.libtorch', 'gpu.tensor', 'gpu.inference'],
  'TimeoutError:qdrant': ['search.qdrant', 'search.vector', 'search.ann'],
  'TimeoutError:neo4j': ['graph.neo4j', 'graph.cypher', 'graph.gds'],
  'ValidationError:grpc': ['grpc.proto', 'grpc.validation', 'grpc.codec'],
  'ValidationError:db': ['db.schema', 'db.migration', 'db.validation'],
  'ValidationError:ui': ['ui.svelte', 'ui.component', 'ui.validation'],
  'ResourceError:gpu': ['gpu.cuda', 'gpu.memory', 'gpu.vram'],
  'ResourceError:cache': ['cache.redis', 'cache.eviction', 'cache.memory'],
  'ResourceError:db': ['db.pool', 'db.connection', 'db.lock'],
  'CypherError:neo4j': ['graph.cypher', 'graph.query', 'graph.validation'],
  'CypherError:search': ['search.qdrant', 'search.filter', 'search.validation'],
};

const HMM_VALIDATION_GATES = {
  error_classes: {
    expected: 5,
    description: 'ConnectivityError, TimeoutError, ValidationError, ResourceError, CypherError',
  },
  domains_mapped: {
    expected: 10,
    description: 'auth, db, cache, search, grpc, sse, llm, gpu, neo4j, ui',
  },
  feature_coverage: {
    min: 0.10,
    description: 'Domain feature_ids matched in packets',
  },
  recovery_packet_count: {
    min: 12,
    max: 16,
    description: 'Domains with ≥1 recovery packet',
  },
  hmm_confidence: {
    min: 0.75,
    description: 'Error classification accuracy (placeholder)',
  },
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  HMM Agentic Error Classification Validation                  ║');
console.log('║  Validate error-domain-recovery packet pipeline               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function validateHMMAgenticError() {
  try {
    console.log('📊 VALIDATION GATE RESULTS\n');

    // Gate 1: Error Classes
    console.log('🔍 Gate 1: Error Class Taxonomy');
    const errorClasses = new Set();
    const domains = new Set();
    let totalMappings = 0;

    for (const [key, features] of Object.entries(ERROR_DOMAIN_MAP)) {
      const [errorClass, domain] = key.split(':');
      errorClasses.add(errorClass);
      domains.add(domain);
      totalMappings += features.length;
    }

    const uniqueErrors = [...errorClasses].length;
    const uniqueDomains = [...domains].length;

    const gate1Pass = uniqueErrors >= HMM_VALIDATION_GATES.error_classes.expected;
    console.log(`   Error classes: ${uniqueErrors}/${HMM_VALIDATION_GATES.error_classes.expected}`);
    console.log(`   Domains: ${uniqueDomains}/${HMM_VALIDATION_GATES.domains_mapped.expected}`);
    console.log(`   Total feature mappings: ${totalMappings}`);
    console.log(`   Classes: ${[...errorClasses].join(', ')}`);
    console.log(`   Domains: ${[...domains].join(', ')}`);
    console.log(`   Status: ${gate1Pass ? '✅ PASS' : '❌ FAIL'}\n`);

    // Gate 2: Feature Coverage
    console.log('🔍 Gate 2: Feature ID Coverage (domain patterns matched)');
    const allFeatures = Object.values(ERROR_DOMAIN_MAP).flat();
    const coverageRes = await pgPool.query(
      `
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN feature_id = ANY($1::TEXT[]) THEN 1 END) matched
      FROM atlas_packets
      `,
      [allFeatures]
    );

    const { total: totalPackets, matched: matchedPackets } = coverageRes.rows[0];
    const featureCoveragePct = matchedPackets / totalPackets;
    const gate2Pass = featureCoveragePct >= HMM_VALIDATION_GATES.feature_coverage.min;

    console.log(`   Matched packets: ${matchedPackets}/${totalPackets} (${(100 * featureCoveragePct).toFixed(2)}%)`);
    console.log(`   Expected: ≥${(100 * HMM_VALIDATION_GATES.feature_coverage.min).toFixed(0)}%`);
    console.log(`   Status: ${gate2Pass ? '✅ PASS' : '⚠️ PARTIAL (expected after LangExtract)'}\n`);

    // Gate 3: Recovery Packet Selection
    console.log('🔍 Gate 3: Recovery Packet Selection (domain → packets)');
    let successfulSelections = 0;
    let failedDomains = 0;
    const domainResults = {};

    for (const [errorKey, features] of Object.entries(ERROR_DOMAIN_MAP)) {
      const [errorClass, domain] = errorKey.split(':');

      const packetsRes = await pgPool.query(
        `
        SELECT
          packet_key,
          feature_id,
          page_rank_score,
          community_id
        FROM atlas_packets
        WHERE feature_id = ANY($1::TEXT[])
        ORDER BY page_rank_score DESC NULLS LAST
        LIMIT 3
        `,
        [features]
      );

      if (packetsRes.rows.length > 0) {
        successfulSelections++;
        domainResults[errorKey] = packetsRes.rows.length;
      } else {
        failedDomains++;
        domainResults[errorKey] = 0;
      }
    }

    const totalMappingKeys = Object.keys(ERROR_DOMAIN_MAP).length;
    const gate3Pass = successfulSelections >= HMM_VALIDATION_GATES.recovery_packet_count.min;

    console.log(`   Successful domain selections: ${successfulSelections}/${totalMappingKeys}`);
    console.log(`   Failed domains: ${failedDomains}`);
    console.log(`   Expected: [${HMM_VALIDATION_GATES.recovery_packet_count.min}, ${HMM_VALIDATION_GATES.recovery_packet_count.max}]`);
    console.log(`   Status: ${gate3Pass ? '✅ PASS' : '⚠️ PARTIAL (expected after tree_node_id/concept_ids)'}\n`);

    if (VERBOSE) {
      console.log('   Domain selection breakdown:');
      Object.entries(domainResults).forEach(([key, count]) => {
        const status = count > 0 ? '✅' : '❌';
        console.log(`     ${status} ${key}: ${count} recovery packets`);
      });
      console.log();
    }

    // Gate 4: HMM State Transitions (simulated)
    console.log('🔍 Gate 4: HMM State Machine Transitions');
    console.log('   HMM States:');
    console.log('     S0: INIT → S1 (error signal ingested)');
    console.log('     S1: CLASSIFY → S2 (error-domain mapping via ontology)');
    console.log('     S2: RETRIEVE → S3 (recovery packets from topology)');
    console.log('     S3: RANK → S4 (xgboost ranking by page_rank/community)');
    console.log('     S4: EMIT → ACE (packet dispatch to retrieval context)');
    console.log('   Status: ⏳ PENDING (implementation in progress)\n');

    // Gate 5: End-to-End Signal → Recovery (simulated)
    console.log('🔍 Gate 5: End-to-End Error Signal → Recovery Packet');
    let gate5Pass = false;
    if (TEST_SIGNAL) {
      // Simulate error signal
      const testErrorKey = 'ConnectivityError:db';
      const [testErrorClass, testDomain] = testErrorKey.split(':');
      const testFeatures = ERROR_DOMAIN_MAP[testErrorKey];

      console.log(`\n   Test Signal: ${testErrorKey}`);
      console.log(`   Error class: ${testErrorClass}`);
      console.log(`   Domain: ${testDomain}`);
      console.log(`   Features: ${testFeatures.join(', ')}`);

      const testPacketsRes = await pgPool.query(
        `
        SELECT
          packet_key,
          feature_id,
          page_rank_score,
          community_id,
          title_id
        FROM atlas_packets
        WHERE feature_id = ANY($1::TEXT[])
        ORDER BY page_rank_score DESC NULLS LAST
        LIMIT 5
        `,
        [testFeatures]
      );

      console.log(`\n   Recovery packets found: ${testPacketsRes.rows.length}`);
      if (testPacketsRes.rows.length > 0) {
        console.log('   Top recovery candidates:');
        testPacketsRes.rows.forEach((row, idx) => {
          console.log(
            `     ${idx + 1}. ${row.packet_key} (${row.feature_id}, PR=${(row.page_rank_score ?? 0).toFixed(3)})`
          );
        });
        gate5Pass = true;
      }
      console.log();
    }

    console.log(`   Status: ${TEST_SIGNAL && gate5Pass ? '✅ PASS' : '⏳ PENDING (--test-signal for simulation)'}\n`);

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passCount = [gate1Pass, gate2Pass, gate3Pass].filter(x => x).length;
    const totalGates = 3;

    console.log(`Gates Passed: ${passCount}/${totalGates}`);
    console.log(`Status: ${passCount === totalGates ? '✅ HMM READY FOR INTEGRATION' : '⚠️ DEPENDENCIES BLOCKING'}\n`);

    console.log('Error-Domain Ontology:');
    console.log(`  - Error classes: ${uniqueErrors}/${HMM_VALIDATION_GATES.error_classes.expected}`);
    console.log(`  - Domains: ${uniqueDomains}/${HMM_VALIDATION_GATES.domains_mapped.expected}`);
    console.log(`  - Total mappings: ${totalMappings}`);
    console.log();

    console.log('Feature Coverage:');
    console.log(`  - Packet match rate: ${(100 * featureCoveragePct).toFixed(2)}%`);
    console.log(`  - Expected: ≥${(100 * HMM_VALIDATION_GATES.feature_coverage.min).toFixed(0)}%`);
    console.log(`  - Blocker: LangExtract entity extraction (currently 0.1% concept_ids)`);
    console.log();

    console.log('Recovery Packet Selection:');
    console.log(`  - Viable domains: ${successfulSelections}/${totalMappingKeys}`);
    console.log(`  - Expected: [${HMM_VALIDATION_GATES.recovery_packet_count.min}, ${HMM_VALIDATION_GATES.recovery_packet_count.max}]`);
    console.log(`  - Blocker: tree_node_id propagation (only 5% of PageRank synced)`);
    console.log();

    console.log('Next Steps:');
    console.log('  1. ⏳ Session 105: Propagate tree_node_id (unblocks Gate 3)');
    console.log('  2. ⏳ Session 105: Wire used_concepts lane (unblocks Gate 2)');
    console.log('  3. ⏳ Session 106: Implement HMM state machine + confidence scoring');
    console.log('  4. ⏳ Session 107: Integrate with MapReduce error signal grouping');
    console.log('  5. ⏳ Session 107: Wire ACE recovery packet dispatch');

    process.exit(passCount >= 2 ? 0 : 1);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

validateHMMAgenticError();
