import pg from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/file-exploration-exact-chunk-binding-v1.json');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const limit = Number.parseInt(process.env.FEI_CHUNK_BINDING_LIMIT ?? '5', 10);
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 20_000 });
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function sourcePath(sourceRef) {
  const direct = path.resolve(root, sourceRef);
  if (existsSync(direct)) return direct;
  const frontend = path.resolve(root, 'sveltekit-frontend', sourceRef);
  return existsSync(frontend) ? frontend : null;
}

try {
  const rows = (await pool.query(
    `SELECT id::text AS chunk_id, source_ref, content, content_hash, line_start, line_end
       FROM public.codebase_chunk_index
      WHERE source_ref IS NOT NULL AND content IS NOT NULL AND length(content) > 0
      ORDER BY id
      LIMIT $1`, [Math.max(1, limit)],
  )).rows;
  const bindings = [];
  for (const row of rows) {
    const file = sourcePath(row.source_ref);
    if (!file) {
      bindings.push({ chunkId: row.chunk_id, sourceRef: row.source_ref, status: 'SOURCE_FILE_MISSING' });
      continue;
    }
    const sourceBytes = await readFile(file);
    const chunkBytes = Buffer.from(row.content, 'utf8');
    const offsets = [];
    let from = 0;
    while (from <= sourceBytes.length - chunkBytes.length) {
      const found = sourceBytes.indexOf(chunkBytes, from);
      if (found < 0) break;
      offsets.push(found);
      from = found + 1;
    }
    bindings.push({
      chunkId: row.chunk_id,
      sourceRef: row.source_ref,
      status: offsets.length === 1 ? 'EXACT_UNIQUE_BYTE_SPAN' : offsets.length === 0 ? 'EXACT_TEXT_NOT_FOUND' : 'EXACT_TEXT_AMBIGUOUS',
      startByte: offsets.length === 1 ? offsets[0] : null,
      endByte: offsets.length === 1 ? offsets[0] + chunkBytes.length : null,
      sourceFileDigest: digest(sourceBytes),
      chunkTextDigest: digest(chunkBytes),
      storedChunkHash: row.content_hash,
      lineStart: row.line_start ?? null,
      lineEnd: row.line_end ?? null,
    });
  }
  const exact = bindings.filter((binding) => binding.status === 'EXACT_UNIQUE_BYTE_SPAN').length;
  const report = {
    schema: 'atlas.file-exploration-exact-chunk-binding.v1',
    gate: 'ATLAS-FILE-EXPLORATION-INDEX-08',
    status: rows.length > 0 && exact === rows.length ? 'EXACT_CHUNK_BINDING_PROVEN_BOUNDED' : 'EXACT_CHUNK_BINDING_NOT_PROVEN',
    requestedRows: limit,
    inspectedRows: rows.length,
    exactUniqueRows: exact,
    bindings,
    sourceRevision: 'not assigned by this audit; must come from canonical workspace binding',
    canonicalAuthority: false,
    readOnly: true,
    writesPerformed: false,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, inspectedRows: rows.length, exactUniqueRows: exact, report: reportPath }, null, 2));
} finally {
  await pool.end();
}
