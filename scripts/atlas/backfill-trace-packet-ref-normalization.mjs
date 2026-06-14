#!/usr/bin/env node
/**
 * Backfill: Trace Packet Ref Normalization
 *
 * Writes a normalization map (not packet identity mutation).
 * Maps legacy trace refs to canonical packet identities.
 *
 * Target table (if exists):
 *   atlas_trace_packet_ref_map
 *
 * Else artifact:
 *   docs/reports/trace-packet-ref-map.json
 *
 * Dry-run default; --apply writes map only, not edges.
 *
 * Output:
 *   - docs/reports/trace-packet-ref-normalization-dry-run.json
 *   - docs/reports/trace-packet-ref-normalization-apply.json
 *   - docs/reports/trace-packet-ref-normalization.md
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
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

function normalizeRef(ref) {
  if (!ref) return null;
  return ref.split('#')[0].split('?')[0];
}

async function backfillNormalization() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log(`║  Trace Packet Ref Normalization — ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 24 : 25)} ║`);
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    steps: [],
    mappings: [],
  };

  try {
    // Step 1: Extract and classify refs (same logic as audit)
    logger.log('Step 1: Extract and classify trace packet refs...');

    const session = neo4jDriver.session();
    const refRes = await session.run(
      `MATCH (t:Trace)-[r:USED_PACKET]->(p)
       RETURN DISTINCT t.packet_ref as packet_ref`
    );
    await session.close();

    const traceRefs = refRes.records.map(record => record.get('packet_ref'));

    logger.ok(`  Found ${traceRefs.length} unique refs`);

    const mappings = [];
    let writeCount = 0;

    for (const legacyRef of traceRefs) {
      const normalizedRef = normalizeRef(legacyRef);

      // Matching logic (same as audit)
      let mapping = {
        legacy_ref: legacyRef,
        canonical_packet_key: null,
        canonical_source_ref: null,
        canonical_feature_id: null,
        qdrant_point_id: null,
        match_status: 'legacy_unresolved',
        evidence_mode: 'legacy_unresolved',
        confidence: 0,
        provenance: [],
        created_at: new Date().toISOString(),
      };

      // Match 1: packet_key
      let pgRes = await pool.query(
        'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
        [legacyRef]
      );

      if (pgRes.rows.length > 0) {
        mapping = {
          ...mapping,
          canonical_packet_key: pgRes.rows[0].packet_key,
          canonical_source_ref: pgRes.rows[0].source_ref,
          canonical_feature_id: pgRes.rows[0].feature_id,
          match_status: 'canonical_packet_key_match',
          evidence_mode: 'canonical',
          confidence: 1.0,
          provenance: ['direct_packet_key_match'],
        };
      } else {
        // Match 2: source_ref
        pgRes = await pool.query(
          'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE source_ref = $1 LIMIT 2',
          [legacyRef]
        );

        if (pgRes.rows.length === 1) {
          mapping = {
            ...mapping,
            canonical_packet_key: pgRes.rows[0].packet_key,
            canonical_source_ref: pgRes.rows[0].source_ref,
            canonical_feature_id: pgRes.rows[0].feature_id,
            match_status: 'canonical_source_ref_match',
            evidence_mode: 'canonical',
            confidence: 0.95,
            provenance: ['direct_source_ref_match'],
          };
        } else if (pgRes.rows.length > 1) {
          mapping = {
            ...mapping,
            match_status: 'ambiguous',
            provenance: [`ambiguous_source_ref_${pgRes.rows.length}_candidates`],
          };
        } else {
          // Match 3: file_path
          pgRes = await pool.query(
            'SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets WHERE file_path = $1 LIMIT 2',
            [normalizedRef]
          );

          if (pgRes.rows.length === 1) {
            mapping = {
              ...mapping,
              canonical_packet_key: pgRes.rows[0].packet_key,
              canonical_source_ref: pgRes.rows[0].source_ref,
              canonical_feature_id: pgRes.rows[0].feature_id,
              match_status: 'canonical_file_path_match',
              evidence_mode: 'canonical',
              confidence: 0.9,
              provenance: ['normalized_file_path_match'],
            };
          } else if (pgRes.rows.length > 1) {
            mapping = {
              ...mapping,
              match_status: 'ambiguous',
              provenance: [`ambiguous_file_path_${pgRes.rows.length}_candidates`],
            };
          } else {
            // Match 4: Qdrant
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
                  mapping = {
                    ...mapping,
                    canonical_packet_key: payload.packet_key,
                    qdrant_point_id: qdrantPoints[0].id,
                    match_status: 'qdrant_payload_match',
                    evidence_mode: 'qdrant_bridge',
                    confidence: 0.85,
                    provenance: ['qdrant_source_ref_match'],
                  };

                  // Resolve to Postgres
                  const pkRes = await pool.query(
                    'SELECT source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
                    [payload.packet_key]
                  );
                  if (pkRes.rows.length > 0) {
                    mapping.canonical_source_ref = pkRes.rows[0].source_ref;
                    mapping.canonical_feature_id = pkRes.rows[0].feature_id;
                  }
                }
              } else if (qdrantPoints.length > 1) {
                mapping = {
                  ...mapping,
                  match_status: 'ambiguous',
                  provenance: [`ambiguous_qdrant_${qdrantPoints.length}_candidates`],
                };
              }
            } catch (err) {
              mapping.provenance.push(`qdrant_error: ${err.message}`);
            }

            // Match 5: Redis
            if (mapping.match_status === 'legacy_unresolved') {
              try {
                await redis.connect();
                const bifrostRes = await redis.hgetall(`bifrost:packet:${legacyRef}`);
                if (bifrostRes?.packet_key) {
                  mapping = {
                    ...mapping,
                    canonical_packet_key: bifrostRes.packet_key,
                    match_status: 'qdrant_payload_match',
                    evidence_mode: 'qdrant_bridge',
                    confidence: 0.8,
                    provenance: ['redis_bifrost_cache_hit'],
                  };

                  const pkRes = await pool.query(
                    'SELECT source_ref, feature_id FROM atlas_codebase_packets WHERE packet_key = $1 LIMIT 1',
                    [bifrostRes.packet_key]
                  );
                  if (pkRes.rows.length > 0) {
                    mapping.canonical_source_ref = pkRes.rows[0].source_ref;
                    mapping.canonical_feature_id = pkRes.rows[0].feature_id;
                  }
                }
                await redis.quit();
              } catch (err) {
                mapping.provenance.push(`redis_error: ${err.message}`);
              }
            }
          }
        }
      }

      mappings.push(mapping);

      // Write canonical matches only (skip ambiguous for now)
      if (!dryRun && mapping.evidence_mode === 'canonical' && mapping.canonical_packet_key) {
        try {
          // Try to insert into table (if exists)
          await pool.query(
            `INSERT INTO atlas_trace_packet_ref_map
             (legacy_ref, canonical_packet_key, canonical_source_ref, canonical_feature_id, match_status, confidence, provenance, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (legacy_ref) DO UPDATE SET
               canonical_packet_key = $2,
               canonical_source_ref = $3,
               canonical_feature_id = $4,
               match_status = $5,
               confidence = $6`,
            [
              mapping.legacy_ref,
              mapping.canonical_packet_key,
              mapping.canonical_source_ref,
              mapping.canonical_feature_id,
              mapping.match_status,
              mapping.confidence,
              JSON.stringify(mapping.provenance),
            ]
          );
          writeCount++;
        } catch (err) {
          if (!err.message.includes('does not exist')) {
            logger.warn(`  Failed to write mapping for ${legacyRef}: ${err.message}`);
          }
        }
      }
    }

    logger.ok(`  Processed ${traceRefs.length} refs`);
    if (!dryRun) {
      logger.ok(`  Wrote ${writeCount} canonical mappings to database`);
    }

    report.mappings = mappings;

    report.steps.push({
      step: 'backfill_mappings',
      status: 'ok',
      total_refs: traceRefs.length,
      canonical_matches: mappings.filter(m => m.evidence_mode === 'canonical').length,
      qdrant_bridge_matches: mappings.filter(m => m.evidence_mode === 'qdrant_bridge').length,
      ambiguous: mappings.filter(m => m.match_status === 'ambiguous').length,
      unresolved: mappings.filter(m => m.match_status === 'legacy_unresolved').length,
      mode: dryRun ? 'DRY_RUN' : 'APPLY',
      written_to_db: !dryRun ? writeCount : 0,
    });

    // Step 2: Write artifact
    logger.log('\nStep 2: Write normalization map artifact...');
    report.steps.push({
      step: 'write_artifact',
      status: 'ok',
    });

    report.status = 'PASS';
    logger.ok(`\n✅ Normalization map ready for USED_PACKET seeding`);

  } catch (err) {
    logger.error(`Backfill failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await backfillNormalization();

  mkdirSync(REPORTS_DIR, { recursive: true });

  const reportFile = dryRun
    ? 'trace-packet-ref-normalization-dry-run.json'
    : 'trace-packet-ref-normalization-apply.json';

  writeFileSync(
    resolve(REPORTS_DIR, reportFile),
    JSON.stringify(report, null, 2)
  );

  // Also write the map artifact
  writeFileSync(
    resolve(REPORTS_DIR, 'trace-packet-ref-map.json'),
    JSON.stringify(report.mappings, null, 2)
  );

  const md = `# Trace Packet Ref Normalization — Backfill

**Timestamp**: ${report.timestamp}
**Mode**: ${report.mode}
**Status**: ${report.status}

## Summary

Built normalization map from legacy trace packet refs to canonical atlas_codebase_packets identities.

## Mappings Written

- **Total Refs**: ${report.mappings.length}
- **Canonical Matches**: ${report.mappings.filter(m => m.evidence_mode === 'canonical').length}
- **Qdrant Bridge**: ${report.mappings.filter(m => m.evidence_mode === 'qdrant_bridge').length}
- **Ambiguous**: ${report.mappings.filter(m => m.match_status === 'ambiguous').length}
- **Unresolved**: ${report.mappings.filter(m => m.match_status === 'legacy_unresolved').length}

## Map Ready

Normalization map is ready for USED_PACKET edge seeding.

**Next step**: \`npm run atlas:higher-hop:used-packet:normalized:dry\`

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'trace-packet-ref-normalization.md'),
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
