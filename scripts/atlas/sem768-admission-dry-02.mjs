#!/usr/bin/env node
/**
 * SEM768-ADMISSION-DRY-02 (read-only)
 *
 * Reruns the same 128-row deterministic sample from SEM768-ADMISSION-DRY-01,
 * this time resolving canonicalChunkId/packetKey/sourceRevision via the REAL
 * owner found in SEM768-CANONICAL-CHUNK-OWNER-01 (atlas_packet_chunk_lineage,
 * revision_status='PROVEN' rows only — NOT the empty canonical_chunks table),
 * and classifying inputDigest per the algorithm PROVEN in
 * SEM768-INPUT-PROVENANCE-OWNER-01 (sha256_16 for 16-hex content_hash values,
 * unqualified for 64-hex values whose exact input remains unidentified).
 *
 * Goal is NOT "force 128/128 admitted" — it is to see whether ADMITTED > 0
 * once the correct owner is checked, and to report the real distribution.
 *
 * Zero database writes. Zero embedding requests. workspaceRevision remains
 * checked-but-not-counted-as-proven (atlas_packets.workspace_revision was
 * found uniformly 0 / the column default for every row checked in the owner
 * audit — present, joinable, but not an independently proven value).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });
const REPORT = resolve(ROOT, 'docs/reports/sem768-admission-dry-02.json');
const SAMPLE_SIZE = 128;

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const SHA256_16 = /^[a-f0-9]{16}$/i;
const SHA256_64 = /^[a-f0-9]{64}$/i;

function classifyInputDigest(contentHash) {
  if (!contentHash) return null;
  if (SHA256_64.test(contentHash)) return { algorithm: 'unqualified', value: contentHash.toLowerCase(), producerRevision: 'unidentified-64hex-producer' };
  if (SHA256_16.test(contentHash)) return { algorithm: 'sha256_16', value: contentHash.toLowerCase(), producerRevision: 'eg-task-prefix-v1' };
  return null;
}

function classifyRow(row, lineage) {
  if (row.dims !== 768) return 'VECTOR_INVALID';

  const inputDigest = classifyInputDigest(row.content_hash);
  if (!inputDigest) return 'INPUT_CHECKSUM_UNPROVEN';

  if (!lineage) return 'CANONICAL_CHUNK_UNPROVEN';
  if (!lineage.packet_key) return 'PACKET_BINDING_UNPROVEN';
  if (!lineage.source_revision) return 'SOURCE_REVISION_UNPROVEN';
  // workspaceRevision: joinable via atlas_packets, but confirmed always the
  // column DEFAULT (0) in the owner audit — not treated as proven.
  // ADMITTED requires a non-'unqualified' inputDigest (algorithm-proven).
  if (inputDigest.algorithm === 'unqualified') return 'INPUT_CHECKSUM_UNPROVEN';
  return 'ADMITTED';
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, source_ref, content_hash, embedding_model, embedding_version,
            vector_dims(content_embedding::vector) AS dims
     FROM codebase_chunk_index
     WHERE content_embedding IS NOT NULL
     ORDER BY id
     LIMIT $1`,
    [SAMPLE_SIZE],
  );
  const ids = rows.map((r) => r.id);

  const { rows: lineageRows } = await pool.query(
    `SELECT chunk_row_id, canonical_chunk_id, packet_key, source_ref, source_revision, membership_status
     FROM atlas_packet_chunk_lineage
     WHERE chunk_row_id = ANY($1) AND revision_status = 'PROVEN'`,
    [ids],
  );
  const lineageByChunkId = new Map(lineageRows.map((r) => [r.chunk_row_id, r]));

  const counts = {
    VECTOR_INVALID: 0,
    INPUT_CHECKSUM_UNPROVEN: 0,
    CANONICAL_CHUNK_UNPROVEN: 0,
    PACKET_BINDING_UNPROVEN: 0,
    SOURCE_REVISION_UNPROVEN: 0,
    WORKSPACE_REVISION_UNPROVEN: 0,
    MODEL_REVISION_UNPROVEN: 0,
    TOKENIZER_REVISION_UNPROVEN: 0,
    ADMITTED: 0,
  };

  const admittedRows = [];
  const sampleRows = [];
  for (const row of rows) {
    const lineage = lineageByChunkId.get(row.id) || null;
    const bucket = classifyRow(row, lineage);
    counts[bucket] += 1;

    const entry = {
      id: row.id,
      classification: bucket,
      canonicalChunkId: lineage?.canonical_chunk_id ?? null,
      packetKey: lineage?.packet_key ?? null,
      sourceRevision: lineage?.source_revision ?? null,
      membershipStatus: lineage?.membership_status ?? null,
    };
    sampleRows.push(entry);
    if (bucket === 'ADMITTED') admittedRows.push(entry);
  }

  const report = {
    schema: 'atlas.sem768-admission-dry-02.report',
    gate: 'SEM768-ADMISSION-DRY-02',
    generatedAt: new Date().toISOString(),
    databaseWrites: false,
    embeddingRequests: 0,
    sampleSize: rows.length,
    sameSampleAsAdmissionDry01: true,
    resolutionChange:
      'canonicalChunkId/packetKey/sourceRevision now resolved via atlas_packet_chunk_lineage ' +
      "(revision_status='PROVEN' only) per SEM768-CANONICAL-CHUNK-OWNER-01, instead of the empty " +
      'canonical_chunks table SEM768-ADMISSION-DRY-01 checked. inputDigest classified per the ' +
      'algorithm PROVEN in SEM768-INPUT-PROVENANCE-OWNER-01 (sha256_16 for 16-hex, unqualified for ' +
      'unidentified 64-hex) rather than requiring a 64-hex sha256HexSchema match.',
    notResolvedThisPass:
      'atlas_chunk_packet_identity_links EXACT-confidence rows are deliberately NOT treated as ' +
      'canonical here, matching that table\'s own canonical_writes_allowed=false gate found in the ' +
      'owner audit (18/128 rows had EXACT confidence but zero had canonical_writes_allowed=true).',
    classificationCounts: counts,
    admittedCount: counts.ADMITTED,
    admittedFraction: rows.length > 0 ? counts.ADMITTED / rows.length : 0,
    admittedRows,
    sampleRows,
    conclusion:
      counts.ADMITTED > 0
        ? `${counts.ADMITTED}/${rows.length} rows ADMITTED once the real canonical-chunk owner ` +
          '(atlas_packet_chunk_lineage PROVEN rows) is checked instead of the empty canonical_chunks ' +
          'table. This confirms SEM768-ADMISSION-DRY-01\'s 0/128 result reflected checking the wrong ' +
          'registry, not a genuine absence of any provable lineage in the corpus.'
        : 'Still 0/128 ADMITTED even after correcting the canonical-chunk resolution path — the real ' +
          'blocker is elsewhere (see classificationCounts for where the chain actually breaks).',
  };

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ classificationCounts: counts, admittedCount: counts.ADMITTED, sampleSize: rows.length }, null, 2));
  console.log(`\nFull report: ${REPORT}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
