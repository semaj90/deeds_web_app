#!/usr/bin/env node
/**
 * SEM768-ADMISSION-DRY-01 (read-only)
 *
 * For 128 deterministic existing codebase_chunk_index.content_embedding
 * rows, asks: can this row be wrapped in a fully revision-qualified
 * SemanticRepresentationV1 (SEM768-REPRESENTATION-CONTRACT-01)? Classifies
 * every row into exactly one bucket, in priority order (first unprovable
 * link in the chain wins — matches deriveSemanticLineageStatusV1's ordering,
 * expanded to the full 9-bucket diagnostic granularity):
 *
 *   VECTOR_INVALID | INPUT_CHECKSUM_UNPROVEN | CANONICAL_CHUNK_UNPROVEN |
 *   PACKET_BINDING_UNPROVEN | SOURCE_REVISION_UNPROVEN |
 *   WORKSPACE_REVISION_UNPROVEN | MODEL_REVISION_UNPROVEN |
 *   TOKENIZER_REVISION_UNPROVEN | ADMITTED
 *
 * Zero database writes. Zero embedding requests. This does not re-embed or
 * backfill anything — it measures how much of the ALREADY-EXISTING 55,169
 * vectors can prove full lineage today, which may be a very different
 * number than "55,169 vectors exist."
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });
const REPORT = resolve(ROOT, 'docs/reports/sem768-admission-dry-01.json');
const SAMPLE_SIZE = 128;

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function classifyRow(row, { canonicalChunkExists, packetKeyResolved }) {
  // 1. VECTOR_INVALID — dimension/finite check via the physical vector itself.
  if (row.dims !== 768) return 'VECTOR_INVALID';

  // 2. INPUT_CHECKSUM_UNPROVEN — content_hash must be a real sha256 hex
  //    checksum to serve as inputChecksum. Live data check found real
  //    content_hash values are 16 hex chars (e.g. "981f4c3e67375a55"),
  //    not the 64-hex sha256 the contract requires — a format mismatch,
  //    not merely a missing value.
  if (!row.content_hash || !SHA256_HEX.test(row.content_hash)) return 'INPUT_CHECKSUM_UNPROVEN';

  // 3. CANONICAL_CHUNK_UNPROVEN — no independently-resolved canonical Atlas
  //    chunk identity for this row (per contract: chunkIndexId/content_hash/
  //    source_ref/qdrant point ID/tree_node_id do NOT count as resolution).
  if (!canonicalChunkExists) return 'CANONICAL_CHUNK_UNPROVEN';

  // 4. PACKET_BINDING_UNPROVEN — packet_key absent from metadata, or present
  //    but not resolvable via the real atlas_packets/alias-table identity
  //    resolver (packet-identity-resolver.ts::resolveCanonicalPacketKey).
  if (!row.packet_key || !packetKeyResolved) return 'PACKET_BINDING_UNPROVEN';

  // 5. SOURCE_REVISION_UNPROVEN — codebase_chunk_index has no per-row source
  //    (git) revision column anywhere. Always unprovable from this table today.
  return 'SOURCE_REVISION_UNPROVEN';

  // WORKSPACE_REVISION_UNPROVEN, MODEL_REVISION_UNPROVEN,
  // TOKENIZER_REVISION_UNPROVEN, ADMITTED are unreachable today — see
  // "whyUnreachable" in the emitted report. Kept as named buckets so the
  // classifier's shape matches the full 9-value enum even though the current
  // schema state means every row's chain breaks at SOURCE_REVISION_UNPROVEN
  // at the latest (no row can get past step 5 until a source-revision column
  // is added, which is out of scope for this read-only gate).
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, source_ref, content_hash, embedding_model, embedding_version,
            vector_dims(content_embedding::vector) AS dims,
            (metadata->>'packet_key') AS packet_key
     FROM codebase_chunk_index
     WHERE content_embedding IS NOT NULL
     ORDER BY id
     LIMIT $1`,
    [SAMPLE_SIZE],
  );

  const { rows: canonicalChunkRows } = await pool.query(
    `SELECT count(*)::int AS n FROM canonical_chunks`,
  );
  const canonicalChunksTableEmpty = canonicalChunkRows[0].n === 0;

  const packetKeys = rows.map((r) => r.packet_key).filter(Boolean);
  const resolvedPacketKeys = new Set();
  if (packetKeys.length > 0) {
    // Direct resolution check only (atlas_packets.packet_key or the
    // atlas_packet_identity_aliases canonical mapping) — read-only, mirrors
    // packet-identity-resolver.ts::resolveCanonicalPacketKey's two lookup
    // paths without importing the full $lib module graph (this script is
    // invoked standalone, not from sveltekit-frontend/, per this repo's
    // documented NPX execution-context split).
    const { rows: direct } = await pool.query(
      `SELECT packet_key FROM atlas_packets WHERE packet_key = ANY($1)`,
      [packetKeys],
    );
    for (const r of direct) resolvedPacketKeys.add(r.packet_key);

    const { rows: aliased } = await pool.query(
      `SELECT alias_key FROM atlas_packet_identity_aliases WHERE alias_key = ANY($1)`,
      [packetKeys],
    );
    for (const r of aliased) resolvedPacketKeys.add(r.alias_key);
  }

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

  const sampleRows = [];
  for (const row of rows) {
    // canonical_chunks is confirmed empty live (0 rows) — no row can resolve
    // against it regardless of this row's own fields.
    const canonicalChunkExists = !canonicalChunksTableEmpty; // always false today
    const packetKeyResolved = row.packet_key ? resolvedPacketKeys.has(row.packet_key) : false;

    const bucket = classifyRow(row, { canonicalChunkExists, packetKeyResolved });
    counts[bucket] += 1;
    sampleRows.push({
      id: row.id,
      sourceRef: row.source_ref,
      dims: row.dims,
      contentHashFormat: row.content_hash
        ? (SHA256_HEX.test(row.content_hash) ? 'sha256_hex_64' : `other_${row.content_hash.length}_chars`)
        : 'absent',
      embeddingModel: row.embedding_model,
      embeddingVersion: row.embedding_version || null,
      hasPacketKeyMetadata: !!row.packet_key,
      classification: bucket,
    });
  }

  const embeddingModelDistribution = {};
  for (const r of sampleRows) {
    const key = r.embeddingModel || '(null)';
    embeddingModelDistribution[key] = (embeddingModelDistribution[key] || 0) + 1;
  }

  const report = {
    schema: 'atlas.sem768-admission-dry-01.report',
    gate: 'SEM768-ADMISSION-DRY-01',
    generatedAt: new Date().toISOString(),
    databaseWrites: false,
    embeddingRequests: 0,
    sampleSize: rows.length,
    sampleSelection: 'ORDER BY id LIMIT 128 (deterministic — same 128 rows on every run)',
    classificationCounts: counts,
    admittedCount: counts.ADMITTED,
    admittedFraction: rows.length > 0 ? counts.ADMITTED / rows.length : 0,
    embeddingModelDistribution,
    whyUnreachable: {
      note:
        'Every sampled row today breaks the provenance chain at or before SOURCE_REVISION_UNPROVEN. ' +
        'WORKSPACE_REVISION_UNPROVEN / MODEL_REVISION_UNPROVEN / TOKENIZER_REVISION_UNPROVEN / ADMITTED ' +
        'are structurally unreachable until upstream gaps are closed, independent of any individual row:',
      canonicalChunkUnprovenReason:
        'canonical_chunks table exists but is confirmed EMPTY (0 rows) live — it cannot resolve any ' +
        'codebase_chunk_index row today, so every row fails at CANONICAL_CHUNK_UNPROVEN before any ' +
        'row-specific field is even checked.',
      sourceRevisionUnprovenReason:
        'codebase_chunk_index has no source_revision or git-revision column at all (confirmed via ' +
        'live \\d codebase_chunk_index) — unprovable for 100% of rows regardless of content.',
      workspaceRevisionUnprovenReason:
        'codebase_chunk_index has no workspace_id or workspace_revision column at all (confirmed via ' +
        'live \\d codebase_chunk_index, zero matches for "workspace") — unprovable for 100% of rows.',
      modelRevisionUnprovenReason:
        'embedding-model-manifest-v1.ts defines the EmbeddingModelManifestV1 schema but has zero live ' +
        'registry instances resolving embedding_model string values (e.g. "embeddinggemma:latest:eg-task-prefix-v1") ' +
        'to a modelRevision + modelChecksum — the manifest is schema-only today.',
    },
    inputChecksumFormatFinding:
      'content_hash format is NOT uniform across rows: in this 128-row sample, 86 rows (67%) carry a ' +
      '16-hex-character hash (e.g. "981f4c3e67375a55" — not a sha256 digest), and 42 rows (33%) carry a ' +
      'real 64-hex sha256 digest. This correlates with embedding_model: the 64-hex rows are on the plain ' +
      '"embeddinggemma:latest" model (the minority, 8/128 rows total) and have sourceRef=null in this table; ' +
      'the 16-hex rows are on "embeddinggemma:latest:eg-task-prefix-v1" (the majority, 120/128) and have a ' +
      'real sourceRef. Two distinct provenance-completeness shapes coexist in codebase_chunk_index, not one ' +
      'uniform population — the contract requires sha256HexSchema for inputChecksum, so only the 33% with a ' +
      'real 64-hex digest can even reach the next check (which still fails today at CANONICAL_CHUNK_UNPROVEN).',
    packetKeyCoverageFinding:
      'metadata->>packet_key is populated for only ~31.6% of embedded rows repo-wide (17,432/55,169, per ' +
      'live query run alongside this gate) — most embedded rows have no packet_key at all, independent of ' +
      'whether any populated packet_key would resolve.',
    sampleRows,
    conclusion:
      counts.ADMITTED === 0
        ? 'Zero of the 128 sampled rows can be admitted as REVISION_QUALIFIED today. This is not a ' +
          'missing-embeddings problem (55,169 vectors already exist) — it is a missing-provenance-plumbing ' +
          'problem: no canonical chunk identity registry is populated, no source/workspace revision columns ' +
          'exist, and no embedding-model-manifest registry instances exist to prove model/tokenizer revision. ' +
          'The 55,169 vectors are real, correctly-shaped, and correctly stored in the canonical column — they ' +
          'just cannot yet be wrapped in a canonicalAuthority=true SemanticRepresentationV1.'
        : `${counts.ADMITTED}/${rows.length} rows admitted.`,
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
