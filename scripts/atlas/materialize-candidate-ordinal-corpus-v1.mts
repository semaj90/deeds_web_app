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
 *   npx tsx scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts --dry-run
 *     --workspace-revision <admitted-revision>
 *     --candidate-snapshot-revision <admitted-snapshot-revision>
 *
 * Outputs:
 *   docs/reports/candidate-ordinal-corpus-v1.json
 *   docs/reports/candidate-ordinal-corpus-receipt-v1.json
 *
 * TODO (stage-3 review, 2026-09-15): the last receipt (2026-08-27) materialized 4,951 rows
 * directly from `atlas_packets` -- this query has NO join through
 * `atlas_packet_chunk_lineage`/`codebase_chunk_index`, so that 4,951-row corpus is NOT
 * lineage-qualified the way the separate 15-row canary (frozen in
 * openspec/changes/parent-atlas-candidate-feature-execution-fabric) is. Before using this
 * script to scale past 15 rows toward 128, add the lineage join (source_ref + source_revision
 * -> atlas_packet_chunk_lineage -> chunk_row_id) and filter to PROVEN rows only, or this
 * becomes exactly the "unqualified/aliased identity" scaling this repo's own tasks.md
 * explicitly forbids. The materializer therefore requires explicit admitted revisions and
 * direct source_revision/packet identity; it never infers graph, semantic, or workspace
 * revisions from packet fields.
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
  source_revision: string | null;
  representation_revision: string | null;
  content_hash: string | null;
  sha256: string | null;
  metadata: Record<string, any> | null;
  lineage_proven: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const shuffle = args.includes('--shuffle');
  const argValue = (name: string): string | null => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
  };
  const workspaceRevision = argValue('--workspace-revision');
  const candidateSnapshotRevision = argValue('--candidate-snapshot-revision');

  if (!workspaceRevision) throw new Error('CURRENT_WORKSPACE_REVISION_REQUIRED');
  if (!candidateSnapshotRevision) throw new Error('CANDIDATE_SNAPSHOT_REVISION_REQUIRED');
  if (!dryRun) throw new Error('ORDINAL_CORPUS_APPLY_REQUIRES_AUTHORIZED_CURRENT_COHORT');

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
      source_revision,
      representation_revision,
      content_hash,
      sha256,
      metadata,
      EXISTS (
        SELECT 1
          FROM atlas_packet_chunk_lineage l
          JOIN codebase_chunk_index cci ON cci.id = l.chunk_row_id
         WHERE l.packet_key = p.packet_key
           AND l.source_ref = COALESCE(p.canonical_source_ref, p.source_ref)
           AND l.source_revision = p.source_revision
           AND l.revision_status = 'PROVEN'
           AND l.chunk_row_id IS NOT NULL
      ) AS lineage_proven
    FROM atlas_packets p
    WHERE p.workspace_revision::text = $1
    ORDER BY p.packet_id ASC
  `;

  let rows: RawCandidateRow[];
  try {
    const res = await pool.query(query, [workspaceRevision]);
    rows = res.rows;
  } finally {
    await pool.end();
  }

  // A packet row alone is not enough for CandidateOrdinal promotion. Require
  // an exact, revision-qualified source→packet→chunk bridge with a real chunk.
  const validRows = rows.filter((r) => {
    const sRef = r.canonical_source_ref || r.source_ref;
    const sRev = r.source_revision;
    return Boolean(
      r.workspace_revision === workspaceRevision &&
      r.packet_key?.trim() &&
      sRef?.trim() &&
      sRev?.trim() &&
      r.lineage_proven === true,
    );
  });

  console.log(`Valid canonical rows: ${validRows.length} / ${rows.length}`);

  // Canonical ordering by canonicalId (packet_id)
  let orderedRows = [...validRows].sort((a, b) => a.packet_id.localeCompare(b.packet_id));

  if (shuffle) {
    console.log('Applying deterministic permutation to test canonical sorting...');
    orderedRows = [...orderedRows].reverse();
    // Sort again deterministically
    orderedRows.sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  }

  const candidates = orderedRows.map((row, idx) => {
    const canonicalId = row.packet_id;
    const packetKey = row.packet_key || null;
    const sourceRef = row.canonical_source_ref || row.source_ref || null;
    const treeNodeId = row.tree_node_id || (row.metadata && row.metadata.tree_node_id) || null;
    const symbolVersionId = (row.metadata && row.metadata.symbol_version_id) || null;
    const sourceRevision = row.source_revision as string;
    const semanticRevision = row.representation_revision || null;
    const graphRevision = null;

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
      representationBindings: [],
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
    lineageQualifiedRowCount: validRows.length,
    lineageRequired: true,
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
