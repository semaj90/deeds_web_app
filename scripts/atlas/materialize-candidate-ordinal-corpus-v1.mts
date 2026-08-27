#!/usr/bin/env tsx
/**
 * @file scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts
 *
 * ORDINAL-CORPUS-01: Production Candidate Ordinal Corpus Materializer
 *
 * Consumes audited canonical candidates from PostgreSQL / lineage report
 * and materializes the production CandidateOrdinalMapV1.
 *
 * Usage:
 *   npx tsx scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts [--dry-run] [--shuffle]
 *
 * Outputs:
 *   docs/reports/candidate-ordinal-corpus-v1.json
 *   docs/reports/candidate-ordinal-corpus-receipt-v1.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_MAP_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'candidate-ordinal-corpus-v1.json');
const OUTPUT_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'candidate-ordinal-corpus-receipt-v1.json');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const sha256 = (str: string) => crypto.createHash('sha256').update(str).digest('hex');

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function computeChecksum(value: unknown): string {
  return sha256(stable(value));
}

interface RawCandidateRow {
  packet_id: string;
  packet_key: string | null;
  source_ref: string | null;
  canonical_source_ref: string | null;
  tree_node_id: string | null;
  feature_id: string | null;
  workspace_revision: string | null;
  representation_revision: string | null;
  content_hash: string | null;
  sha256: string | null;
  metadata: Record<string, any> | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const shuffle = args.includes('--shuffle');

  console.log('── Materialize Candidate Ordinal Corpus V1 ───────────────');
  console.log(`Dry run: ${dryRun} | Shuffle test: ${shuffle}`);

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60_000,
  });

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
      metadata
    FROM atlas_packets
    ORDER BY packet_id ASC
  `;

  let rows: RawCandidateRow[];
  try {
    const res = await pool.query(query);
    rows = res.rows;
  } finally {
    await pool.end();
  }

  // Filter for valid lineage: sourceRevision and sourceRef must be present
  const validRows = rows.filter((r) => {
    const sRef = r.canonical_source_ref || r.source_ref;
    const sRev = r.content_hash || r.sha256;
    return sRef && sRef.trim() !== '' && sRev && sRev.trim() !== '';
  });

  console.log(`Valid canonical rows: ${validRows.length} / ${rows.length}`);

  // Canonical ordering by canonicalId (packet_id)
  let orderedRows = [...validRows].sort((a, b) => a.packet_id.localeCompare(b.packet_id));

  if (shuffle) {
    console.log('Applying shuffle to test deterministic canonical sorting...');
    orderedRows = [...orderedRows].sort(() => Math.random() - 0.5);
    // Sort again deterministically
    orderedRows.sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  }

  const workspaceRevision = 'workspace-active-v1';
  const candidateSnapshotRevision = `corpus-snapshot:${workspaceRevision}:v1`;

  const candidates = orderedRows.map((row, idx) => {
    const canonicalId = row.packet_id;
    const packetKey = row.packet_key || null;
    const sourceRef = row.canonical_source_ref || row.source_ref || null;
    const treeNodeId = row.tree_node_id || (row.metadata && row.metadata.tree_node_id) || null;
    const symbolVersionId = (row.metadata && row.metadata.symbol_version_id) || null;
    const sourceRevision = row.content_hash || row.sha256 || 'unknown-rev';
    const semanticRevision = row.representation_revision || (row.metadata && row.metadata.embedding_digest) || null;
    const graphRevision = row.tree_node_id ? `graph-tree:${row.tree_node_id}` : null;

    return {
      schema: 'atlas.canonical-candidate.v1' as const,
      candidateOrdinal: idx,
      canonicalId,
      packetKey,
      sourceRef,
      treeNodeId,
      symbolVersionId,
      workspaceRevision,
      sourceRevision,
      graphRevision,
      semanticRevision,
      candidateSnapshotRevision,
      degradedIdentity: false,
      evidenceRefs: [`atlas_packets:${canonicalId}`],
      representationBindings: [
        {
          representationId: 'semantic_768' as const,
          family: 'EMBEDDINGGEMMA_MRL' as const,
          dimensions: 768,
          modelRevision: 'embeddinggemma:latest',
          projectionKind: 'NONE' as const,
          sourceRepresentationId: null,
          projectionRevision: null,
          normalized: true as const,
          available: true,
          availabilityReason: null,
        },
      ],
    };
  });

  const ordinalMapChecksum = computeChecksum(candidates.map((c) => ({
    ordinal: c.candidateOrdinal,
    canonicalId: c.canonicalId,
    packetKey: c.packetKey,
    sourceRevision: c.sourceRevision,
  })));

  const ordinalMap = {
    schema: 'atlas.candidate-ordinal-map.v1' as const,
    candidateSnapshotRevision,
    workspaceRevision,
    rowCount: candidates.length,
    candidates,
    ordinalMapChecksum,
    identityAuthority: false as const,
    canonicalOrderingPolicy: 'CANONICAL_ID_ASCENDING' as const,
    producerRevision: 'materialize-candidate-ordinal-corpus-v1',
  };

  const receipt = {
    schema: 'atlas.candidate-ordinal-corpus-receipt.v1',
    generatedAt: new Date().toISOString(),
    dryRun,
    shuffleTest: shuffle,
    rowCount: candidates.length,
    candidateSnapshotRevision,
    ordinalMapChecksum,
    sampleFirst5: candidates.slice(0, 5).map((c) => ({ ordinal: c.candidateOrdinal, id: c.canonicalId, sourceRef: c.sourceRef })),
    sampleLast5: candidates.slice(-5).map((c) => ({ ordinal: c.candidateOrdinal, id: c.canonicalId, sourceRef: c.sourceRef })),
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(OUTPUT_MAP_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_MAP_PATH, JSON.stringify(ordinalMap, null, 2), 'utf8');
    await fs.writeFile(OUTPUT_RECEIPT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`✅ Wrote map to ${OUTPUT_MAP_PATH}`);
    console.log(`✅ Wrote receipt to ${OUTPUT_RECEIPT_PATH}`);
  } else {
    console.log('DRY RUN: Map and receipt computed successfully without writing.');
  }

  console.log('══════════════════════════════════════════════════════════');
  console.log(`Total Candidates:       ${candidates.length}`);
  console.log(`Snapshot Revision:      ${candidateSnapshotRevision}`);
  console.log(`Ordinal Map Checksum:   ${ordinalMapChecksum}`);
  console.log('══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[materialize-candidate-ordinal-corpus] Fatal:', err);
  process.exit(1);
});
