// OMR-P0-05 (option A): bounded, read-only, checkpointed CouchDB _changes exporter.
// Issues GET requests only. Writes NDJSON captures and a checkpoint under outDir, never to CouchDB or PostgreSQL.
// Publish order: temp artifact -> verify digest -> rename -> checkpoint (temp + rename). Checkpoint advances last.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const EXPORT_SCHEMA_V1 = 'atlas.couchdb-readonly-export.v1';
export const CHECKPOINT_SCHEMA_V1 = 'atlas.couchdb-readonly-checkpoint.v1';

const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** Validate one _changes row. Anything malformed is refused, never guessed. */
export function parseChangesRow(row) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || row.id.length === 0) {
    throw new Error('MALFORMED_RESPONSE:ROW_ID');
  }
  const rev = Array.isArray(row.changes) && typeof row.changes[0]?.rev === 'string' ? row.changes[0].rev : null;
  if (!rev) throw new Error('MALFORMED_RESPONSE:ROW_REV');
  return { id: row.id, rev, deleted: row.deleted === true, seq: String(row.seq ?? '') };
}

async function readCheckpoint(checkpointPath, database, outDir) {
  let text;
  try {
    text = await fs.readFile(checkpointPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let cp;
  try {
    cp = JSON.parse(text);
  } catch {
    throw new Error('CHECKPOINT_CORRUPT:PARSE');
  }
  if (cp.schema !== CHECKPOINT_SCHEMA_V1) throw new Error('CHECKPOINT_INCOMPATIBLE:SCHEMA');
  if (cp.database !== database) throw new Error('CHECKPOINT_INCOMPATIBLE:DATABASE');
  for (const artifact of cp.artifacts) {
    const bytes = await fs.readFile(path.join(outDir, artifact.file), 'utf8').catch(() => null);
    if (bytes === null || sha256(bytes) !== artifact.sha256) throw new Error(`CHECKPOINT_CORRUPT:ARTIFACT:${artifact.file}`);
  }
  return cp;
}

async function writeAtomic(target, text) {
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, target);
}

/**
 * Export one allowlisted database from the checkpoint's sequence token to the end of its feed.
 * Returns { status, recordCount, tombstones, lastSeq, artifact } and never advances the checkpoint on failure.
 */
export async function exportChangesFeedV1({
  fetchFn, baseUrl, authorization, database, allowlist, outDir, checkpointPath,
  pageSize = 100, maxDocs = 10_000, maxPages = 100, maxBytes = 50 * 1024 * 1024,
  runId = `run-${Date.now()}`,
}) {
  if (!allowlist.includes(database)) throw new Error('DATABASE_NOT_ALLOWLISTED');
  await fs.mkdir(outDir, { recursive: true });
  const prior = await readCheckpoint(checkpointPath, database, outDir);
  let since = prior?.lastSeq ?? '0';
  const lines = [];
  let bytes = 0;
  let tombstones = 0;
  let pages = 0;
  let lastSeq = since;
  let feedEnded = false;

  while (!feedEnded) {
    if (pages >= maxPages) throw new Error('BOUND_EXCEEDED:PAGES');
    const url = new URL(`/${encodeURIComponent(database)}/_changes`, baseUrl);
    url.searchParams.set('since', since);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('style', 'all_docs');
    const response = await fetchFn(url.toString(), { method: 'GET', headers: { Authorization: authorization } });
    if (!response.ok) throw new Error(`CHANGES_GET_FAILED:HTTP_${response.status}`);
    const body = await response.json();
    if (!body || !Array.isArray(body.results) || typeof body.last_seq === 'undefined') {
      throw new Error('MALFORMED_RESPONSE:PAGE');
    }
    pages += 1;
    if (body.results.length === 0) {
      feedEnded = true;
      break;
    }
    for (const row of body.results) {
      const record = parseChangesRow(row);
      if (record.deleted) tombstones += 1;
      const line = JSON.stringify(record);
      bytes += Buffer.byteLength(line, 'utf8') + 1;
      if (bytes > maxBytes) throw new Error('BOUND_EXCEEDED:BYTES');
      lines.push(line);
      if (lines.length > maxDocs) throw new Error('BOUND_EXCEEDED:DOCS');
    }
    since = String(body.last_seq);
    lastSeq = since;
    if (body.results.length < pageSize) feedEnded = true;
  }

  if (lines.length === 0) {
    return { status: 'NO_CHANGES', recordCount: 0, tombstones: 0, lastSeq, artifact: null };
  }

  const text = lines.join('\n') + '\n';
  const file = `${database}.${runId}.ndjson`;
  const target = path.join(outDir, file);
  const digest = sha256(text);
  // 1. temp artifact, 2. verify the digest by re-reading, 3. publish by rename.
  await fs.writeFile(`${target}.tmp`, text, 'utf8');
  const reread = await fs.readFile(`${target}.tmp`, 'utf8');
  if (sha256(reread) !== digest) {
    await fs.rm(`${target}.tmp`, { force: true });
    throw new Error('ARTIFACT_VERIFY_FAILED');
  }
  await fs.rename(`${target}.tmp`, target);

  // 4. checkpoint last, after the artifact is durable and verified.
  const artifacts = [...(prior?.artifacts ?? []), { file, sha256: digest, recordCount: lines.length, tombstones }];
  const checkpoint = { schema: CHECKPOINT_SCHEMA_V1, database, lastSeq, artifacts };
  await writeAtomic(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
  return { status: 'EXPORTED', recordCount: lines.length, tombstones, lastSeq, artifact: file, captureDigest: digest };
}
