#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-candidate-corpus-lineage-v1.mjs
 *
 * ORDINAL-CORPUS-00: Production Candidate Corpus Lineage Audit
 *
 * Queries canonical Postgres atlas_packets to audit revision & identity completeness.
 * Excludes rows missing source_revision (no fallback to workspaceRevision, mtime, or board.generated).
 *
 * Outputs:
 *   docs/reports/candidate-corpus-lineage-v1.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'candidate-corpus-lineage-v1.json');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60_000,
  });

  console.log('── Audit Candidate Corpus Lineage V1 ─────────────────────');
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const query = `
    SELECT 
      packet_id,
      packet_key,
      source_ref,
      canonical_source_ref,
      tree_node_id,
      feature_id,
      workspace_revision,
      representation_revision,
      content_hash,
      sha256,
      metadata,
      source_kind
    FROM atlas_packets
    ORDER BY packet_id ASC
  `;

  let rows;
  try {
    const res = await pool.query(query);
    rows = res.rows;
  } finally {
    await pool.end();
  }

  console.log(`Auditing ${rows.length} rows from atlas_packets...`);

  let admittedCount = 0;
  let excludedMissingSourceRevision = 0;
  let excludedMissingSourceRef = 0;
  let excludedAmbiguous = 0;

  const admittedCandidates = [];
  const exclusionReasons = {};

  for (const row of rows) {
    const canonicalId = row.packet_id;
    const packetKey = row.packet_key || null;
    const sourceRef = row.canonical_source_ref || row.source_ref || null;
    const treeNodeId = row.tree_node_id || (row.metadata && row.metadata.tree_node_id) || null;
    const symbolVersionId = (row.metadata && row.metadata.symbol_version_id) || null;

    // Only explicit revision metadata is admissible. Content hashes are
    // evidence fields, not a substitute for sourceRevision, and synthetic
    // workspace/graph revisions must never enter this audit's candidate set.
    const sourceRevision = (row.metadata && row.metadata.source_revision) || null;
    const workspaceRevision = row.workspace_revision || null;
    const semanticRevision = row.representation_revision || (row.metadata && row.metadata.embedding_digest) || null;
    const graphRevision = (row.metadata && row.metadata.graph_revision) || null;

    if (!sourceRef || sourceRef.trim() === '') {
      excludedMissingSourceRef++;
      exclusionReasons['MISSING_SOURCE_REF'] = (exclusionReasons['MISSING_SOURCE_REF'] || 0) + 1;
      continue;
    }

    if (!sourceRevision || sourceRevision.trim() === '') {
      excludedMissingSourceRevision++;
      exclusionReasons['MISSING_SOURCE_REVISION'] = (exclusionReasons['MISSING_SOURCE_REVISION'] || 0) + 1;
      continue;
    }

    admittedCount++;
    admittedCandidates.push({
      canonicalId,
      packetKey,
      sourceRef,
      treeNodeId,
      symbolVersionId,
      featureId: row.feature_id || null,
      workspaceRevision,
      sourceRevision,
      graphRevision,
      semanticRevision,
      sourceKind: row.source_kind || 'codebase',
    });
  }

  const censusReceipt = {
    schema: 'atlas.candidate-corpus-lineage-audit.v1',
    status: 'DIAGNOSTIC_ONLY',
    promotionEligible: false,
    syntheticRevisionFallbacksUsed: false,
    generatedAt: new Date().toISOString(),
    totalRowsAudited: rows.length,
    admittedCount,
    excludedCount: rows.length - admittedCount,
    admittedRatio: rows.length > 0 ? admittedCount / rows.length : 0,
    exclusions: {
      missingSourceRevision: excludedMissingSourceRevision,
      missingSourceRef: excludedMissingSourceRef,
      ambiguous: excludedAmbiguous,
      breakdown: exclusionReasons,
    },
    sampleAdmitted: admittedCandidates.slice(0, 5),
    lineageChecksum: sha256(JSON.stringify(admittedCandidates)),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(censusReceipt, null, 2), 'utf8');

  console.log('══════════════════════════════════════════════════════════');
  console.log(`Total packets audited:       ${rows.length}`);
  console.log(`Admitted candidates:        ${admittedCount} (${(censusReceipt.admittedRatio * 100).toFixed(2)}%)`);
  console.log(`Excluded candidates:         ${censusReceipt.excludedCount}`);
  console.log(`  missing source revision:   ${excludedMissingSourceRevision}`);
  console.log(`  missing source ref:        ${excludedMissingSourceRef}`);
  console.log(`Lineage Checksum:           ${censusReceipt.lineageChecksum}`);
  console.log(`Report written to:          ${REPORT_PATH}`);
  console.log('══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[audit-candidate-corpus-lineage] Fatal:', err);
  process.exit(1);
});
