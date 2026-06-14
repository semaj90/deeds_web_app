#!/usr/bin/env node
/**
 * Debug: Qdrant ↔ Postgres Identity Reconciliation
 *
 * Purpose: Discover why sampled agreement = 0/50
 *
 * Outputs:
 * - docs/reports/qdrant-postgres-mismatch-debug.json (machine)
 * - docs/reports/qdrant-postgres-mismatch-debug.md (human)
 *
 * Pass gate: sampled_agreement > 95%
 *
 * Why this matters:
 * Until identity consistency is explained, DO NOT:
 * - Train autoencoder 768→64
 * - Build SOM 20×20
 * - Enrich with higher-hop Neo4j
 * - Compute Karpathy blend
 * Because enrichment amplifies drift.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

// ============================================================================
// CONFIG
// ============================================================================

const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const SAMPLE_SIZE = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : 50;
const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// LOGGER
// ============================================================================

const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => VERBOSE && console.log(`[DEBUG] ${msg}`),
};

// ============================================================================
// POSTGRES CLIENT
// ============================================================================

let pgClient = null;

async function connectPostgres() {
  try {
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    pgClient = new Pool({ connectionString: DB_URL });
    log.info(`Connected to Postgres: ${DB_URL.split('@')[1]}`);
    return pgClient;
  } catch (err) {
    log.error(`Failed to connect to Postgres: ${err.message}`);
    process.exit(1);
  }
}

// ============================================================================
// QDRANT CLIENT
// ============================================================================

async function getQdrantPoints(limit) {
  try {
    const response = await fetch(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit })
      }
    );

    if (!response.ok) {
      throw new Error(`Qdrant HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result?.points || [];
  } catch (err) {
    log.error(`Failed to fetch Qdrant points: ${err.message}`);
    process.exit(1);
  }
}

// ============================================================================
// POSTGRES QUERIES
// ============================================================================

async function getPacketsBySourceRef(sourceRefs) {
  if (!sourceRefs.length) return new Map();

  const placeholders = sourceRefs.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT
      packet_key,
      source_ref,
      feature_id,
      feature_label
    FROM atlas_packets
    WHERE source_ref IN (${placeholders})
  `;

  const result = await pgClient.query(query, sourceRefs);
  const map = new Map();

  for (const row of result.rows) {
    map.set(row.source_ref, {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
    });
  }

  return map;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeSourceRef(ref) {
  if (!ref) return null;
  // Remove trailing slashes, normalize separators
  return ref.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function compareFields(qdrantValue, postgresValue, fieldName) {
  if (qdrantValue === postgresValue) {
    return { match: true, qdrant: qdrantValue, postgres: postgresValue };
  }

  // Try normalized comparison for source_ref
  if (fieldName === 'source_ref') {
    const qNorm = normalizeSourceRef(qdrantValue);
    const pNorm = normalizeSourceRef(postgresValue);
    if (qNorm === pNorm) {
      return { match: true, qdrant: qdrantValue, postgres: postgresValue, normalized: true };
    }
  }

  return { match: false, qdrant: qdrantValue, postgres: postgresValue };
}

// ============================================================================
// MAIN RECONCILIATION
// ============================================================================

async function main() {
  log.info('=== Qdrant ↔ Postgres Identity Reconciliation ===\n');

  // Connect
  await connectPostgres();

  // Fetch Qdrant points
  log.info(`Fetching ${SAMPLE_SIZE} random points from Qdrant...`);
  const qdrantPoints = await getQdrantPoints(SAMPLE_SIZE);
  log.info(`Fetched ${qdrantPoints.length} points`);

  if (qdrantPoints.length === 0) {
    log.error('No points in Qdrant collection');
    process.exit(1);
  }

  // Extract source_ref from Qdrant
  const qdrantSourceRefs = qdrantPoints
    .map((p) => p.payload?.source_ref)
    .filter(Boolean);

  log.info(`\nFetching Postgres packets for ${qdrantSourceRefs.length} source_refs...`);
  const postgresMap = await getPacketsBySourceRef(qdrantSourceRefs);
  log.info(`Fetched ${postgresMap.size} packets from Postgres`);

  // Reconcile
  log.info(`\nReconciling ${qdrantPoints.length} Qdrant points with Postgres packets...\n`);

  const results = [];
  let matchCount = 0;
  let mismatchCount = 0;

  for (const qdrantPoint of qdrantPoints) {
    const payload = qdrantPoint.payload || {};
    const sourceRef = payload.source_ref;

    if (!sourceRef) {
      log.warn(`Qdrant point ${qdrantPoint.id} has no source_ref`);
      continue;
    }

    const postgresRecord = postgresMap.get(sourceRef);

    if (!postgresRecord) {
      mismatchCount++;
      results.push({
        qdrant_point_id: qdrantPoint.id,
        source_ref: sourceRef,
        qdrant: {
          packet_key: payload.packet_key,
          source_ref: payload.source_ref,
          feature_id: payload.feature_id,
          feature_label: payload.feature_label,
          metadata_keys: payload.metadata ? Object.keys(payload.metadata) : [],
        },
        postgres: null,
        normalized_source_ref: normalizeSourceRef(sourceRef),
        mismatch_fields: ['postgres_record_missing'],
        agreement: false,
      });

      log.warn(`[MISSING] ${sourceRef} in Postgres`);
      continue;
    }

    // Compare fields
    const mismatches = [];

    const packetKeyComp = compareFields(payload.packet_key, postgresRecord.packet_key, 'packet_key');
    if (!packetKeyComp.match) {
      mismatches.push('packet_key');
    }

    const featureIdComp = compareFields(payload.feature_id, postgresRecord.feature_id, 'feature_id');
    if (!featureIdComp.match) {
      mismatches.push('feature_id');
    }

    const featureLabelComp = compareFields(payload.feature_label, postgresRecord.feature_label, 'feature_label');
    if (!featureLabelComp.match) {
      mismatches.push('feature_label');
    }

    const agreement = mismatches.length === 0;

    if (agreement) {
      matchCount++;
    } else {
      mismatchCount++;
    }

    results.push({
      qdrant_point_id: qdrantPoint.id,
      source_ref: sourceRef,
      qdrant: {
        packet_key: payload.packet_key,
        source_ref: payload.source_ref,
        feature_id: payload.feature_id,
        feature_label: payload.feature_label,
        metadata_keys: payload.metadata ? Object.keys(payload.metadata) : [],
      },
      postgres: {
        packet_key: postgresRecord.packet_key,
        source_ref: postgresRecord.source_ref,
        feature_id: postgresRecord.feature_id,
        feature_label: postgresRecord.feature_label,
        metadata_keys: postgresRecord.metadata_keys,
      },
      normalized_source_ref: normalizeSourceRef(sourceRef),
      mismatch_fields: mismatches,
      agreement,
    });

    if (agreement) {
      log.info(`[OK] ${sourceRef}`);
    } else {
      log.warn(`[MISMATCH] ${sourceRef}: ${mismatches.join(', ')}`);
    }
  }

  // Summary
  const agreementPct = qdrantPoints.length > 0 ? ((matchCount / qdrantPoints.length) * 100).toFixed(1) : 0;

  log.info(`\n=== Summary ===`);
  log.info(`Total points sampled: ${qdrantPoints.length}`);
  log.info(`Agreements: ${matchCount}`);
  log.info(`Mismatches: ${mismatchCount}`);
  log.info(`Agreement %: ${agreementPct}%`);
  log.info(`GATE: ${parseFloat(agreementPct) >= 95 ? '✅ PASS (>95%)' : '❌ FAIL (<95%)'}`);

  // Generate reports
  const report = {
    timestamp: new Date().toISOString(),
    qdrant: {
      host: QDRANT_HOST,
      port: QDRANT_PORT,
      collection: QDRANT_COLLECTION,
      points_sampled: qdrantPoints.length,
    },
    postgres: {
      host: DB_URL.split('@')[1],
      packets_found: postgresMap.size,
    },
    reconciliation: {
      total_points: qdrantPoints.length,
      agreements: matchCount,
      mismatches: mismatchCount,
      agreement_percent: parseFloat(agreementPct),
      gate_pass: parseFloat(agreementPct) >= 95,
    },
    results,
  };

  // Write JSON report
  const jsonPath = path.join(ROOT, 'docs/reports/qdrant-postgres-mismatch-debug.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  log.info(`\nJSON report: ${jsonPath}`);

  // Write Markdown report
  const mdPath = path.join(ROOT, 'docs/reports/qdrant-postgres-mismatch-debug.md');
  let md = `# Qdrant ↔ Postgres Identity Reconciliation\n\n`;
  md += `**Generated**: ${report.timestamp}\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Points Sampled | ${report.reconciliation.total_points} |\n`;
  md += `| Agreements | ${report.reconciliation.agreements} |\n`;
  md += `| Mismatches | ${report.reconciliation.mismatches} |\n`;
  md += `| Agreement % | ${report.reconciliation.agreement_percent.toFixed(1)}% |\n`;
  md += `| **Gate Status** | **${report.reconciliation.gate_pass ? '✅ PASS' : '❌ FAIL'}** |\n\n`;

  if (report.reconciliation.mismatches > 0) {
    md += `## Mismatches\n\n`;
    const mismatches = results.filter((r) => !r.agreement);
    for (const result of mismatches) {
      md += `### ${result.source_ref}\n\n`;
      md += `**Qdrant Point ID**: \`${result.qdrant_point_id}\`\n\n`;
      if (result.postgres) {
        md += `| Field | Qdrant | Postgres |\n`;
        md += `|-------|--------|----------|\n`;
        for (const field of result.mismatch_fields) {
          const qVal = result.qdrant[field];
          const pVal = result.postgres[field];
          md += `| \`${field}\` | \`${qVal}\` | \`${pVal}\` |\n`;
        }
      } else {
        md += `**Status**: Postgres record missing\n`;
      }
      md += `\n`;
    }
  }

  md += `## Recommendations\n\n`;
  if (report.reconciliation.gate_pass) {
    md += `✅ **Agreement > 95%** — Identity is consistent.\n\n`;
    md += `Proceed with:\n`;
    md += `1. Higher-hop Neo4j enrichment\n`;
    md += `2. Autoencoder 768→64 training\n`;
    md += `3. SOM 20×20 computation\n`;
    md += `4. Karpathy blend reindex\n`;
    md += `5. Gemma4 topology-aware planning\n`;
  } else {
    md += `❌ **Agreement < 95%** — Identity drift detected.\n\n`;
    md += `DO NOT proceed with:\n`;
    md += `- Autoencoder training (will learn corrupted neighborhoods)\n`;
    md += `- SOM computation (will inherit drift)\n`;
    md += `- Neo4j enrichment (will amplify mismatches)\n`;
    md += `- Karpathy reindex (blend will be corrupted)\n\n`;
    md += `Investigation required:\n`;
    md += `1. Check which fields are drifting (packet_key vs feature_id vs source_ref)\n`;
    md += `2. Trace when drift occurred (which ingestion phase)\n`;
    md += `3. Audit upsert logic in each mismatch path\n`;
    md += `4. Re-sync Qdrant from Postgres (if drift is at Qdrant layer)\n`;
  }

  fs.writeFileSync(mdPath, md);
  log.info(`Markdown report: ${mdPath}`);

  // Cleanup
  await pgClient.end();

  // Exit with appropriate code
  process.exit(report.reconciliation.gate_pass ? 0 : 1);
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
