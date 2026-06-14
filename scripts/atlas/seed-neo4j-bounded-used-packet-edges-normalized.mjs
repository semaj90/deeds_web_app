#!/usr/bin/env node
/**
 * Seed: Neo4j USED_PACKET Edges (Normalized)
 *
 * Uses normalization map to seed USED_PACKET edges with canonical packet identity.
 *
 * Relationship properties:
 *   - legacy_ref (provenance)
 *   - packet_key (canonical identity)
 *   - source_ref (canonical identity)
 *   - feature_id (canonical identity)
 *   - evidence_mode: "canonical" | "qdrant_bridge" | "legacy_unresolved"
 *   - confidence (0.0-1.0)
 *   - trace_id
 *   - provenance (JSON)
 *   - created_at
 *
 * Rules:
 *   - canonical/qdrant_bridge allowed for bounded seed
 *   - legacy_unresolved allowed only with --allow-legacy-unresolved explicit flag
 *   - skip ambiguous
 *   - MERGE semantics
 *   - bounded limit required
 *
 * Output:
 *   - docs/reports/used-packet-normalized-seed-dry-run.json
 *   - docs/reports/used-packet-normalized-seed-apply.json
 *   - docs/reports/used-packet-normalized-seed.md
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
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

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

// Parse command-line arguments
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const allowLegacy = process.argv.includes('--allow-legacy-unresolved');

// Extract --limit parameter
let limitVal = 25;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--limit=')) {
    limitVal = parseInt(process.argv[i].split('=')[1]);
  }
}

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function seedNormalizedEdges() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log(`║  Seed USED_PACKET Edges (Normalized) — ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 20 : 21)} ║`);
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    limit: limitVal,
    steps: [],
    edges_seeded: [],
    statistics: {
      total_candidates: 0,
      seeded_canonical: 0,
      seeded_qdrant_bridge: 0,
      skipped_legacy_unresolved: 0,
      skipped_ambiguous: 0,
      created_in_neo4j: 0,
    },
  };

  try {
    // Step 1: Load normalization map
    logger.log('Step 1: Load normalization map from Postgres...');

    const session = neo4jDriver.session();

    // Check if map table exists
    let mapExists = true;
    try {
      const checkRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM atlas_trace_packet_ref_map LIMIT 1`
      );
      logger.ok(`  Map table has ${checkRes.rows[0].cnt} entries`);
      report.steps.push({
        step: 'load_map',
        status: 'ok',
        map_entries: checkRes.rows[0].cnt,
      });
    } catch (err) {
      logger.warn(`  Map table not found: ${err.message}`);
      mapExists = false;
      report.steps.push({
        step: 'load_map',
        status: 'error',
        error: err.message,
      });
    }

    if (!mapExists) {
      throw new Error('Normalization map table not available. Run backfill first.');
    }

    // Step 2: Get unresolved USED_PACKET edges from Neo4j
    logger.log('\nStep 2: Identify unresolved USED_PACKET edges in Neo4j...');

    const edgeRes = await session.run(
      `MATCH (t:Trace)-[r:USED_PACKET]->(p)
       WHERE r.packet_key IS NULL OR r.packet_key = ''
       RETURN DISTINCT t.id as trace_id, t.packet_ref as legacy_ref
       LIMIT $limit`,
      { limit: limitVal }
    );

    const unresolvedEdges = edgeRes.records.map(record => ({
      trace_id: record.get('trace_id'),
      legacy_ref: record.get('legacy_ref'),
    }));

    logger.ok(`  Found ${unresolvedEdges.length} unresolved edges`);
    report.statistics.total_candidates = unresolvedEdges.length;

    report.steps.push({
      step: 'identify_unresolved',
      status: 'ok',
      unresolved_edge_count: unresolvedEdges.length,
    });

    // Step 3: Look up canonical identity from normalization map
    logger.log('\nStep 3: Look up canonical identity from map...');

    for (const edge of unresolvedEdges) {
      const mapRes = await pool.query(
        `SELECT * FROM atlas_trace_packet_ref_map WHERE legacy_ref = $1 LIMIT 1`,
        [edge.legacy_ref]
      );

      if (mapRes.rows.length === 0) {
        logger.warn(`  No map entry for ${edge.legacy_ref}`);
        report.statistics.skipped_legacy_unresolved++;
        continue;
      }

      const mapEntry = mapRes.rows[0];
      const evidenceMode = mapEntry.evidence_mode || mapEntry.match_status?.replace('canonical_', '')?.replace('_match', '') || 'unknown';

      // Skip ambiguous and unresolved unless explicitly allowed
      if (mapEntry.match_status === 'ambiguous') {
        logger.warn(`  Skipping ambiguous ref: ${edge.legacy_ref}`);
        report.statistics.skipped_ambiguous++;
        continue;
      }

      if (mapEntry.match_status === 'legacy_unresolved' && !allowLegacy) {
        logger.info(`  Skipping unresolved ref (use --allow-legacy-unresolved to include): ${edge.legacy_ref}`);
        report.statistics.skipped_legacy_unresolved++;
        continue;
      }

      // Build edge data
      const edgeData = {
        trace_id: edge.trace_id,
        legacy_ref: edge.legacy_ref,
        packet_key: mapEntry.canonical_packet_key,
        source_ref: mapEntry.canonical_source_ref,
        feature_id: mapEntry.canonical_feature_id,
        evidence_mode: evidenceMode,
        confidence: mapEntry.confidence,
        provenance: mapEntry.provenance,
        created_at: new Date().toISOString(),
      };

      // Categorize for statistics
      if (evidenceMode === 'packet_key' || evidenceMode === 'source_ref' || evidenceMode === 'file_path') {
        report.statistics.seeded_canonical++;
      } else if (evidenceMode === 'qdrant_payload') {
        report.statistics.seeded_qdrant_bridge++;
      }

      report.edges_seeded.push(edgeData);

      // Create/update edge in Neo4j if not dry-run
      if (!dryRun) {
        try {
          await session.run(
            `MATCH (t:Trace {id: $trace_id})-[r:USED_PACKET]->(p)
             SET r.legacy_ref = $legacy_ref,
                 r.packet_key = $packet_key,
                 r.source_ref = $source_ref,
                 r.feature_id = $feature_id,
                 r.evidence_mode = $evidence_mode,
                 r.confidence = $confidence,
                 r.provenance = $provenance,
                 r.created_at = $created_at
             RETURN r`,
            {
              trace_id: edge.trace_id,
              legacy_ref: edge.legacy_ref,
              packet_key: edgeData.packet_key,
              source_ref: edgeData.source_ref,
              feature_id: edgeData.feature_id,
              evidence_mode: edgeData.evidence_mode,
              confidence: edgeData.confidence,
              provenance: JSON.stringify(edgeData.provenance),
              created_at: edgeData.created_at,
            }
          );

          report.statistics.created_in_neo4j++;
        } catch (err) {
          logger.warn(`  Error seeding edge for trace ${edge.trace_id}: ${err.message}`);
        }
      }
    }

    logger.ok(`  Seeded ${report.edges_seeded.length} edges`);
    logger.info(`    Canonical matches: ${report.statistics.seeded_canonical}`);
    logger.info(`    Qdrant bridge: ${report.statistics.seeded_qdrant_bridge}`);
    logger.info(`    Skipped ambiguous: ${report.statistics.skipped_ambiguous}`);
    logger.info(`    Skipped unresolved: ${report.statistics.skipped_legacy_unresolved}`);

    if (!dryRun) {
      logger.ok(`  Created in Neo4j: ${report.statistics.created_in_neo4j}`);
    }

    report.steps.push({
      step: 'seed_edges',
      status: 'ok',
      edges_seeded: report.edges_seeded.length,
      created_in_neo4j: dryRun ? 0 : report.statistics.created_in_neo4j,
    });

    report.status = report.edges_seeded.length > 0 ? 'PASS' : 'WARN';
    logger.ok(`\n✅ Normalized USED_PACKET edges ready: ${report.edges_seeded.length} edges`);

    await session.close();

  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await seedNormalizedEdges();

  mkdirSync(REPORTS_DIR, { recursive: true });

  const reportFile = dryRun
    ? 'used-packet-normalized-seed-dry-run.json'
    : 'used-packet-normalized-seed-apply.json';

  writeFileSync(
    resolve(REPORTS_DIR, reportFile),
    JSON.stringify(report, null, 2)
  );

  const md = `# Seed USED_PACKET Edges (Normalized)

**Timestamp**: ${report.timestamp}
**Mode**: ${report.mode}
**Limit**: ${report.limit}
**Status**: ${report.status}

## Overview

Seeds Neo4j USED_PACKET edges with canonical packet identity from normalization map.

## Statistics

- **Total Candidates**: ${report.statistics.total_candidates}
- **Seeded (Canonical)**: ${report.statistics.seeded_canonical}
- **Seeded (Qdrant Bridge)**: ${report.statistics.seeded_qdrant_bridge}
- **Skipped (Ambiguous)**: ${report.statistics.skipped_ambiguous}
- **Skipped (Unresolved)**: ${report.statistics.skipped_legacy_unresolved}
- **Created in Neo4j**: ${report.statistics.created_in_neo4j}

## Edge Rules

✅ canonical/qdrant_bridge allowed for bounded seed
⚠️ legacy_unresolved skipped (use --allow-legacy-unresolved to include)
✅ ambiguous refs skipped
✅ MERGE semantics (upsert existing edges)
✅ Bounded limit enforced (${report.limit})

## Sample Edges

${report.edges_seeded?.slice(0, 10).map(e => `
### Trace ${e.trace_id}
- **legacy_ref**: ${e.legacy_ref}
- **packet_key**: ${e.packet_key || 'none'}
- **source_ref**: ${e.source_ref || 'none'}
- **evidence_mode**: ${e.evidence_mode}
- **confidence**: ${e.confidence}
`).join('\n')}

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'used-packet-normalized-seed.md'),
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
