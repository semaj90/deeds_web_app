#!/usr/bin/env node
/**
 * SEMANTIC-TOPK-01 (parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Read-only export of the real semantic_768 vectors for the proven 15-row canary
 * (docs/reports/lineage-semantic-768-cohort-v1.json) in candidateOrdinal order, so a GPU
 * cuVS-vs-CPU-exact oracle proof can run against real production vectors instead of a synthetic
 * fixture. Writes ZERO rows to any store -- SELECT only.
 *
 * Reads from `codebase_chunk_index.content_embedding` (halfvec(768)) -- the CLAUDE.md-canonical
 * column (55,169 populated rows, verified genuinely 768-dim via vector_dims()) -- NOT
 * `content_embedding_768` (a separate, smaller vector(768) column CLAUDE.md's Embedding
 * Dimensions Policy explicitly says "is not [canonical]", despite the lineage receipt's own
 * `contract.canonicalVectorColumn` field claiming otherwise). Both columns happen to be populated
 * for all 15 canary rows (checked live), so this only matters if their values ever diverge -- not
 * re-verified numerically here, but the column CHOICE follows the documented canonical policy,
 * not the receipt's possibly-stale claim.
 *
 * Exactly-one-row guarantee: `codebase_chunk_index.id` is the table's real PRIMARY KEY (confirmed
 * live via pg_constraint, contype='p'), so a `WHERE id = ANY(...)` query cannot structurally
 * return duplicate rows per id -- this script still asserts `rows.length === ids.length` as a
 * cheap belt-and-braces check on the query result shape, not because a duplicate is actually
 * possible here.
 *
 * Usage: node scripts/atlas/export-semantic-768-canary-vectors-v1.mjs
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

async function loadEnv() {
  const envPath = path.resolve(REPO_ROOT, 'sveltekit-frontend/.env');
  const raw = await readFile(envPath, 'utf8').catch(() => '');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

function parseHalfvec(text) {
  return text.slice(1, -1).split(',').map(Number);
}

async function main() {
  await loadEnv();
  const receiptPath = path.resolve(REPO_ROOT, 'docs/reports/lineage-semantic-768-cohort-v1.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const ids = receipt.candidates.map((c) => c.codebaseChunkId);
    const result = await client.query(
      `SELECT id::text AS id, content_embedding::text AS vec
       FROM codebase_chunk_index
       WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    if (result.rows.length !== ids.length) {
      throw new Error(
        `SEMANTIC_768_CANARY_EXPORT_ROW_COUNT_MISMATCH:requested=${ids.length},returned=${result.rows.length}`,
      );
    }
    const byId = new Map(result.rows.map((r) => [r.id, r.vec]));

    const missing = ids.filter((id) => !byId.has(id) || byId.get(id) == null);
    if (missing.length > 0) {
      throw new Error(`SEMANTIC_TOPK_INPUT_NOT_EXACT:missing=${missing.join(',')}`);
    }

    const ordered = receipt.candidates.map((c) => ({
      candidateOrdinal: c.candidateOrdinal,
      codebaseChunkId: c.codebaseChunkId,
      packetKey: c.packetKey,
      sourceRef: c.sourceRef,
      vector: parseHalfvec(byId.get(c.codebaseChunkId)),
    }));

    for (const row of ordered) {
      if (row.vector.length !== 768) {
        throw new Error(`SEMANTIC_768_CANARY_EXPORT_WRONG_DIMENSION:${row.codebaseChunkId}:${row.vector.length}`);
      }
      if (row.vector.some((v) => !Number.isFinite(v))) {
        throw new Error(`SEMANTIC_768_CANARY_EXPORT_NON_FINITE:${row.codebaseChunkId}`);
      }
    }

    const inputVectorsChecksum = createHash('sha256');
    for (const row of ordered) {
      const bytes = Buffer.alloc(row.vector.length * 4);
      row.vector.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
      inputVectorsChecksum.update(bytes);
    }
    const orderedCandidateBindingChecksum = createHash('sha256')
      .update(ordered.map((r) => `${r.candidateOrdinal}:${r.codebaseChunkId}`).join(','))
      .digest('hex');

    const outPath = path.resolve(REPO_ROOT, 'docs/reports/semantic-768-canary-vectors-v1.json');
    const payload = {
      schema: 'atlas.semantic-768-canary-vectors.v1',
      sourceReceipt: 'docs/reports/lineage-semantic-768-cohort-v1.json',
      candidateSnapshotRevision: receipt.candidateMap.candidateSnapshotRevision,
      ordinalMapChecksum: receipt.candidateMap.ordinalMapChecksum,
      vectorColumn: 'content_embedding',
      sourceStorageDtype: 'halfvec',
      dimensions: 768,
      candidateCount: ordered.length,
      inputVectorsChecksum: inputVectorsChecksum.digest('hex'),
      orderedCandidateBindingChecksum,
      canonicalAuthority: false,
      writesPerformed: false,
      candidates: ordered,
    };
    await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ status: 'EXPORTED', outPath, candidateCount: ordered.length }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
