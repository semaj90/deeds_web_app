import fs from 'node:fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
try {
  const snapshot = JSON.parse(fs.readFileSync('docs/reports/pkt-lineage-08-bounded-snapshot-v1.json', 'utf8'));
  const expectedChunkRowIds = snapshot.bindings.flatMap(b => b.chunks.map(c => c.chunkRowId));
  const rows = (await pool.query(
    `select packet_key, canonical_chunk_id, chunk_row_id::text, source_ref, source_namespace, source_revision, membership_status, revision_status
     from public.atlas_packet_chunk_lineage where chunk_row_id = any($1::uuid[])`,
    [expectedChunkRowIds],
  )).rows;
  const byChunkRowId = new Map(rows.map(r => [r.chunk_row_id, r]));
  let exact = 0, missing = 0, mismatched = [];
  for (const b of snapshot.bindings) {
    for (const c of b.chunks) {
      const row = byChunkRowId.get(c.chunkRowId);
      if (!row) { missing++; continue; }
      if (row.canonical_chunk_id === c.canonicalChunkId && row.source_ref === c.sourceRef) exact++;
      else mismatched.push({ chunkRowId: c.chunkRowId, expected: c, actual: row });
    }
  }
  console.log(JSON.stringify({ totalExpected: expectedChunkRowIds.length, foundRows: rows.length, exact, missing, mismatchedCount: mismatched.length, sample: rows[0] }, null, 2));
} finally { await pool.end(); }
