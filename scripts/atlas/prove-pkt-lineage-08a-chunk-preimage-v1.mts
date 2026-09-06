#!/usr/bin/env node
/** Read-only chunk-grain preimage proof for PKT-LINEAGE-08A-03. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const receiptPath = path.resolve(REPO_ROOT, process.argv.find((value) => value.startsWith('--receipt='))?.slice(9) ?? 'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json');
const reportPath = path.join(REPO_ROOT, 'docs/reports/pkt-lineage-08a-chunk-preimage-proof-v1.json');
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
if (receipt.schema !== 'atlas.bounded-lineage-snapshot.v1' || receipt.status !== 'BOUNDED_LINEAGE_SNAPSHOT_PROVEN') throw new Error('BOUNDED_RECEIPT_NOT_PROVEN');
const plans = receipt.bindings.flatMap((binding) => (binding.chunks ?? []).map((chunk) => ({ ...chunk, sourceRef: binding.sourceRef })));
if (!plans.length) throw new Error('CHUNK_PREIMAGE_TARGET_EMPTY');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let rows = [];
let databaseError = null;
try {
  const result = await pool.query(`
    SELECT id::text AS chunk_row_id, source_ref, relative_path, chunk_id AS canonical_chunk_id,
           content_hash, content
      FROM public.codebase_chunk_index
     WHERE id = ANY($1::uuid[])
     ORDER BY id
  `, [plans.map((plan) => plan.chunkRowId)]);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally { await pool.end(); }
const byId = new Map(rows.map((row) => [row.chunk_row_id, row]));
const results = plans.map((plan) => {
  const row = byId.get(plan.chunkRowId);
  const content = row?.content == null ? null : String(row.content);
  const sourceMatches = row?.source_ref === plan.sourceRef && row?.relative_path === plan.expectedRelativePath;
  const identityMatches = String(row?.canonical_chunk_id ?? '') === String(plan.canonicalChunkId);
  const storedHashMatches = String(row?.content_hash ?? '') === String(plan.chunkContentHash ?? '');
  const preimageMatches = content != null && digest(content) === plan.chunkPreimageChecksum;
  return { chunkRowId: plan.chunkRowId, sourceRef: plan.sourceRef, sourceMatches, identityMatches, storedHashMatches, preimageMatches, status: row && sourceMatches && identityMatches && storedHashMatches && preimageMatches ? 'EXACT_CHUNK_PREIMAGE' : 'CHUNK_PREIMAGE_MISMATCH' };
});
const counts = results.reduce((out, row) => { out[row.status] = (out[row.status] ?? 0) + 1; return out; }, {});
const report = {
  schema: 'atlas.pkt-lineage-08a.chunk-preimage-proof.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CHUNK_GRAIN_PROOF',
  boundedReceipt: receiptPath,
  targetRowCount: plans.length,
  readbackRowCount: rows.length,
  counts,
  wholeSourceHashComparedToChunkHash: false,
  canonicalAuthority: false,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  databaseError,
  status: databaseError ? 'CHUNK_PREIMAGE_PROOF_FAILED' : results.every((row) => row.status === 'EXACT_CHUNK_PREIMAGE') ? 'CHUNK_PREIMAGE_PROVEN' : 'CHUNK_PREIMAGE_PROOF_BLOCKED',
  rows: results,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, targetRowCount: plans.length, readbackRowCount: rows.length, counts, reportPath }, null, 2));
