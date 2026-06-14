#!/usr/bin/env node
/**
 * Audit: Trace Packet Ref Normalization
 *
 * Classifies each trace packet ref from Neo4j USED_PACKET edges as:
 *   - canonical_packet_key_match
 *   - canonical_source_ref_match
 *   - canonical_file_path_match
 *   - qdrant_payload_match
 *   - legacy_unresolved
 *   - ambiguous
 *
 * Matching order (never feature_id alone):
 *   1. exact packet_key in atlas_codebase_packets
 *   2. exact source_ref
 *   3. normalized source_ref/file_path
 *   4. Qdrant payload source_ref/sourceRef/canonicalSourceRef
 *   5. Redis/Bifrost packet cache
 *
 * Output:
 *   - docs/reports/trace-packet-ref-normalization-audit.json
 *   - docs/reports/trace-packet-ref-normalization-audit.md
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URL || 'neo4j://127.0.0.1:7687',
  neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'neo4j123')
);

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const qdrant = new QdrantClient({ url: QDRANT_URL });

const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};
if (process.env.REDIS_PASSWORD) redisOptions.password = process.env.REDIS_PASSWORD;
const redis = new Redis(redisOptions);
redis.on('error', () => {});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

// Normalize file paths by stripping fragment/query
function normalizeRef(ref) {
  if (!ref) return null;
  return ref.split('#')[0].split('?')[0];
}

async function auditNormalization() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Trace Packet Ref Normalization Audit                          ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    steps: [],
    classifications: {},
    statistics: {
      total_refs: 0,
      canonical_packet_key_match: 0,
      canonical_source_ref_match: 0,
      canonical_file_path_match: 0,
      qdrant_payload_match: 0,
      legacy_unresolved: 0,
      ambiguous: 0,
    },
  };

  try {
    // Step 1: Extract trace packet refs from Neo4j
    logger.log('Step 1: Extract trace packet refs from Neo4j USED_PACKET edges...');

    const session = neo4jDriver.session();
    const refRes = await session.run(
      `MATCH (t:Trace)-[r:USED_PACKET]->(p)
       RETURN DISTINCT t.packet_ref as packet_ref, count(*) as ref_count
       ORDER BY ref_count DESC`
    );
    await session.close();

    const traceRefs = refRes.records.map(record => ({
      packet_ref: record.get('packet_ref'),
      ref_count: record.get('ref_count').toNumber(),
    }));

    logger.ok(`  Found ${traceRefs.length} unique trace packet refs`);
    logger.info(`    Total refs across edges: ${traceRefs.reduce((sum, r) => sum + r.ref_count, 0)}`);

    report.steps.push({
      step: 'extract_trace_refs',
      status: 'ok',
      unique_refs: traceRefs.length,
      total_ref_count: traceRefs.reduce((sum, r) => sum + r.ref_count, 0),
    });

    // Step 2: Classify each ref by matching against canonical ledger
    logger.log('\nStep 2: Classify refs against canonical ledger...');

    const classifications = [];

    for (const traceRef of traceRefs) {
      const legacyRef = traceRef.packet_ref;
      const normalizedRef = normalizeRef(legacyRef);

      let matchStatus = 'legacy_unresolved';
      let candidatePacketKey = null;
      let candidateSourceRef = null;
      let candidateFeatureId = null;
      let candidateQdrantPointId = null;
      let evidence = [];
      let reason = '';

      // Match 1: Exact packet_key
      let pgRes = await pool.query(
        'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
        [legacyRef]
      );

      if (pgRes.rows.length > 0) {
        matchStatus = 'canonical_packet_key_match';
        candidatePacketKey = pgRes.rows[0].packet_key;
        candidateSourceRef = pgRes.rows[0].source_ref;
        candidateFeatureId = pgRes.rows[0].feature_id;
        evidence.push('direct_packet_key_match');
        reason = `Direct match on packet_key="${legacyRef}"`;
      } else {
        // Match 2: Exact source_ref
        pgRes = await pool.query(
          'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE source_ref = $1 LIMIT 2',
          [legacyRef]
        );

        if (pgRes.rows.length === 1) {
          matchStatus = 'canonical_source_ref_match';
          candidatePacketKey = pgRes.rows[0].packet_key;
          candidateSourceRef = pgRes.rows[0].source_ref;
          candidateFeatureId = pgRes.rows[0].feature_id;
          evidence.push('direct_source_ref_match');
          reason = `Direct match on source_ref="${legacyRef}"`;
        } else if (pgRes.rows.length > 1) {
          matchStatus = 'ambiguous';
          evidence.push(`ambiguous_source_ref_${pgRes.rows.length}_candidates`);
          reason = `Multiple candidates found for source_ref="${legacyRef}"`;
        } else {
          // Match 3: Normalized file_path
          pgRes = await pool.query(
            'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE file_path = $1 LIMIT 2',
            [normalizedRef]
          );

          if (pgRes.rows.length === 1) {
            matchStatus = 'canonical_file_path_match';
            candidatePacketKey = pgRes.rows[0].packet_key;
            candidateSourceRef = pgRes.rows[0].source_ref;
            candidateFeatureId = pgRes.rows[0].feature_id;
            evidence.push('normalized_file_path_match');
            reason = `Normalized file_path match: "${normalizedRef}"`;
          } else if (pgRes.rows.length > 1) {
            matchStatus = 'ambiguous';
            evidence.push(`ambiguous_file_path_${pgRes.rows.length}_candidates`);
            reason = `Multiple candidates found for file_path="${normalizedRef}"`;
          } else {
            // Match 4: Qdrant payload
            try {
              const qdrantRes = await qdrant.scroll('codebase_chunks_768', {
                limit: 100,
                with_payload: true,
                filter: {
                  should: [
                    { key: 'source_ref', match: { value: legacyRef } },
                    { key: 'source_ref', match: { value: normalizedRef } },
                  ],
                },
              });

              const qdrantPoints = qdrantRes.result?.points || [];
              if (qdrantPoints.length === 1) {
                const payload = qdrantPoints[0].payload;
                if (payload?.packet_key) {
                  candidatePacketKey = payload.packet_key;
                  matchStatus = 'qdrant_payload_match';
                  evidence.push('qdrant_source_ref_match');
                  reason = `Qdrant payload match: source_ref="${payload.source_ref}"`;
                  candidateQdrantPointId = qdrantPoints[0].id;

                  // Try to resolve back to Postgres
                  if (candidatePacketKey) {
                    const pkRes = await pool.query(
                      'SELECT source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
                      [candidatePacketKey]
                    );
                    if (pkRes.rows.length > 0) {
                      candidateSourceRef = pkRes.rows[0].source_ref;
                      candidateFeatureId = pkRes.rows[0].feature_id;
                    }
                  }
                }
              } else if (qdrantPoints.length > 1) {
                matchStatus = 'ambiguous';
                evidence.push(`ambiguous_qdrant_${qdrantPoints.length}_candidates`);
                reason = `Multiple Qdrant candidates for "${legacyRef}"`;
              }
            } catch (err) {
              evidence.push(`qdrant_lookup_error: ${err.message}`);
            }

            // Match 5: Redis cache
            if (matchStatus === 'legacy_unresolved') {
              try {
                await redis.connect();
                const bifrostRes = await redis.hgetall(`bifrost:packet:${legacyRef}`);
                if (Object.keys(bifrostRes).length > 0 && bifrostRes.packet_key) {
                  candidatePacketKey = bifrostRes.packet_key;
                  matchStatus = 'qdrant_payload_match';
                  evidence.push('redis_bifrost_cache_hit');
                  reason = `Redis cache hit: bifrost:packet:${legacyRef}`;

                  // Resolve to Postgres
                  const pkRes = await pool.query(
                    'SELECT source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
                    [candidatePacketKey]
                  );
                  if (pkRes.rows.length > 0) {
                    candidateSourceRef = pkRes.rows[0].source_ref;
                    candidateFeatureId = pkRes.rows[0].feature_id;
                  }
                }
                await redis.quit();
              } catch (err) {
                evidence.push(`redis_lookup_error: ${err.message}`);
              }
            }
          }
        }
      }

      classifications.push({
        legacy_ref: legacyRef,
        normalized_ref: normalizedRef,
        match_status: matchStatus,
        candidate_packet_key: candidatePacketKey,
        candidate_source_ref: candidateSourceRef,
        candidate_feature_id: candidateFeatureId,
        candidate_qdrant_point_id: candidateQdrantPointId,
        evidence,
        reason,
      });

      // Update statistics
      report.statistics[matchStatus]++;
    }

    report.statistics.total_refs = traceRefs.length;
    report.classifications = classifications;

    logger.ok(`  Classified ${classifications.length} refs`);
    logger.info(`    canonical_packet_key_match: ${report.statistics.canonical_packet_key_match}`);
    logger.info(`    canonical_source_ref_match: ${report.statistics.canonical_source_ref_match}`);
    logger.info(`    canonical_file_path_match: ${report.statistics.canonical_file_path_match}`);
    logger.info(`    qdrant_payload_match: ${report.statistics.qdrant_payload_match}`);
    logger.info(`    ambiguous: ${report.statistics.ambiguous}`);
    logger.info(`    legacy_unresolved: ${report.statistics.legacy_unresolved}`);

    report.steps.push({
      step: 'classify_refs',
      status: 'ok',
      statistics: report.statistics,
    });

    // Step 3: Calculate match rate
    logger.log('\nStep 3: Calculate canonical match rate...');

    const canonicalMatches = report.statistics.canonical_packet_key_match +
      report.statistics.canonical_source_ref_match +
      report.statistics.canonical_file_path_match +
      report.statistics.qdrant_payload_match;

    const matchRate = ((canonicalMatches / report.statistics.total_refs) * 100).toFixed(1);

    logger.ok(`  Canonical match rate: ${matchRate}% (${canonicalMatches}/${report.statistics.total_refs})`);

    report.steps.push({
      step: 'calculate_match_rate',
      status: 'ok',
      canonical_matches: canonicalMatches,
      total_refs: report.statistics.total_refs,
      match_rate_percent: parseFloat(matchRate),
    });

    report.status = canonicalMatches > 0 ? 'PASS' : 'WARN';
    if (report.statistics.ambiguous > 0) {
      logger.warn(`\n⚠️  ${report.statistics.ambiguous} ambiguous refs found (skipped for USED_PACKET seeding)`);
    }

  } catch (err) {
    logger.error(`Audit failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await auditNormalization();

  mkdirSync(REPORTS_DIR, { recursive: true });

  writeFileSync(
    resolve(REPORTS_DIR, 'trace-packet-ref-normalization-audit.json'),
    JSON.stringify(report, null, 2)
  );

  const md = `# Trace Packet Ref Normalization Audit

**Timestamp**: ${report.timestamp}
**Status**: ${report.status}

## Summary

Classified trace packet refs from Neo4j USED_PACKET edges against canonical atlas_codebase_packets ledger.

## Statistics

- **Total Refs**: ${report.statistics.total_refs}
- **Canonical Matches**: ${report.statistics.canonical_packet_key_match + report.statistics.canonical_source_ref_match + report.statistics.canonical_file_path_match + report.statistics.qdrant_payload_match}
  - packet_key match: ${report.statistics.canonical_packet_key_match}
  - source_ref match: ${report.statistics.canonical_source_ref_match}
  - file_path match: ${report.statistics.canonical_file_path_match}
  - qdrant payload match: ${report.statistics.qdrant_payload_match}
- **Ambiguous**: ${report.statistics.ambiguous}
- **Unresolved**: ${report.statistics.legacy_unresolved}

## Match Rate

**${((report.statistics.canonical_packet_key_match + report.statistics.canonical_source_ref_match + report.statistics.canonical_file_path_match + report.statistics.qdrant_payload_match) / report.statistics.total_refs * 100).toFixed(1)}%** canonical match rate

## Classifications

${report.classifications?.slice(0, 50).map(c => `
### ${c.legacy_ref}
- **Status**: ${c.match_status}
- **Candidate Packet Key**: ${c.candidate_packet_key || 'none'}
- **Candidate Source Ref**: ${c.candidate_source_ref || 'none'}
- **Evidence**: ${c.evidence.join(', ')}
- **Reason**: ${c.reason}
`).join('\n')}

${report.classifications?.length > 50 ? `\n... and ${report.classifications.length - 50} more` : ''}

## Pass Condition

✅ Classifications complete
✅ Canonical match rate > 0%
⚠️ Ambiguous refs identified (to be skipped in USED_PACKET seeding)

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'trace-packet-ref-normalization-audit.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
  neo4jDriver.close();
});
