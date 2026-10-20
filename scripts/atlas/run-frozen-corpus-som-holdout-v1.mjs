#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const corpusDir = path.join(REPO_ROOT, '.tmp', 'atlas');
const manifestPath = path.join(corpusDir, 'frozen-corpus-03-manifest.tsv');
const expectedManifestHash = '61ae0c08f0d212c25bc0bb7378ec6a6c67c212d2fe03e77ed199087e60eeb257';
const workspaceRevision = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const runRequested = process.argv.includes('--run');
const verifyVectorOrderRequested = process.argv.includes('--verify-vector-order');
const planOnly = process.argv.includes('--plan-only') || !runRequested;
const nearDuplicatesRequested = process.argv.includes('--near-duplicates');
if ([runRequested, verifyVectorOrderRequested, nearDuplicatesRequested].filter(Boolean).length > 1) {
  throw new Error('SELECT_ONLY_ONE_EXECUTION_MODE');
}
const outputPath = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length)
  ?? (verifyVectorOrderRequested
    ? '.tmp/atlas/frozen-corpus-03-vector-ordinal-binding-v1.json'
    : nearDuplicatesRequested
      ? '.tmp/atlas/frozen-corpus-03-near-duplicate-review-v1.json'
      : '.tmp/atlas/frozen-corpus-som-holdout-v2.json');
const epochs = Number(process.argv.find((arg) => arg.startsWith('--epochs='))?.split('=')[1] ?? '150');
const seeds = process.argv.find((arg) => arg.startsWith('--seeds='))?.split('=')[1]?.split(',').map(Number)
  ?? [20261019, 1, 2];
const jitter = Number(process.argv.find((arg) => arg.startsWith('--jitter='))?.split('=')[1] ?? '0.05');

if (!Number.isInteger(epochs) || epochs < 1 || !seeds.every(Number.isInteger) || seeds.length < 2 || new Set(seeds).size !== seeds.length || !Number.isFinite(jitter) || jitter < 0) {
  throw new Error('INVALID_HOLDOUT_CONFIGURATION');
}
if (!fs.existsSync(manifestPath)) throw new Error('FROZEN_MANIFEST_NOT_FOUND');

const manifestBytes = fs.readFileSync(manifestPath);
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
if (manifestSha256 !== expectedManifestHash) throw new Error('FROZEN_MANIFEST_CHECKSUM_MISMATCH');
const manifest = manifestBytes.toString('utf8').trim().split(/\r?\n/).map((line) => line.split('\t'));
if (manifest.length !== 98_335) throw new Error('FROZEN_MANIFEST_ROW_COUNT_MISMATCH');
const ids = manifest.map((row, ordinal) => {
  if (row.length < 7 || Number(row[0]) !== ordinal || !row[1]) throw new Error(`INVALID_MANIFEST_ROW:${ordinal}`);
  return row[1];
});
if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_FROZEN_CHUNK_ID');
const freezeLocalOrdinalMapChecksum = createHash('sha256').update(ids.join('\n')).digest('hex');

const client = new pg.Client({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  statement_timeout: 120_000,
  application_name: 'frozen-corpus-som-holdout-read-only-v1',
});
await client.connect();
let rows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(
    `SELECT f.id::text AS id, c.relative_path, c.source_ref,
            b.source_revision, b.workspace_revision, b.content_digest
       FROM unnest($1::uuid[]) AS f(id)
       JOIN public.codebase_chunk_index c ON c.id = f.id
       JOIN public.atlas_workspace_source_bindings b
         ON b.repo_id = 'deeds-web-app'
        AND b.workspace_revision = $2
        AND lower(b.canonical_source_ref) = lower(c.relative_path)
        AND lower(b.content_digest) = lower(c.file_content_hash)`,
    [ids, workspaceRevision],
  );
  rows = result.rows;
  if (rows.length !== manifest.length) throw new Error(`QUALIFIED_JOIN_ROW_COUNT_MISMATCH:${rows.length}`);
  const byId = new Map();
  for (const row of rows) {
    if (byId.has(row.id)) throw new Error(`DUPLICATE_QUALIFIED_CHUNK_ID:${row.id}`);
    byId.set(row.id, row);
  }
  const sourceRevisionByRef = {};
  const sourceRefs = manifest.map((entry, ordinal) => {
    const row = byId.get(entry[1]);
    if (!row || !row.relative_path || !row.source_ref) throw new Error(`SOURCE_BINDING_MISSING:${ordinal}`);
    if (String(row.content_digest).toLowerCase() !== entry[3].toLowerCase()) throw new Error(`CONTENT_DIGEST_MISMATCH:${ordinal}`);
    if (row.source_revision !== entry[5]) throw new Error(`SOURCE_REVISION_MISMATCH:${ordinal}`);
    if (row.workspace_revision !== entry[6] || row.workspace_revision !== workspaceRevision) throw new Error(`WORKSPACE_REVISION_MISMATCH:${ordinal}`);
    const sourceRef = String(row.relative_path).replaceAll('\\', '/');
    const priorRevision = sourceRevisionByRef[sourceRef];
    if (priorRevision && priorRevision !== row.source_revision) throw new Error(`FILE_REVISION_DRIFT:${ordinal}`);
    sourceRevisionByRef[sourceRef] = row.source_revision;
    return sourceRef;
  });
  const distinctFiles = new Set(sourceRefs).size;
  if (distinctFiles !== 10_249) throw new Error(`FROZEN_FILE_COUNT_MISMATCH:${distinctFiles}`);
  if (verifyVectorOrderRequested) {
    const vectorPath = path.join(corpusDir, 'frozen-corpus-03-768.npy');
    const fd = fs.openSync(vectorPath, 'r');
    try {
      const prefix = Buffer.alloc(16);
      fs.readSync(fd, prefix, 0, prefix.length, 0);
      if (prefix.subarray(0, 6).toString('binary') !== '\x93NUMPY') throw new Error('INVALID_NPY_MAGIC');
      const major = prefix[6];
      const headerLength = major === 1 ? prefix.readUInt16LE(8) : prefix.readUInt32LE(8);
      const headerStart = major === 1 ? 10 : 12;
      const dataOffset = headerStart + headerLength;
      const header = Buffer.alloc(headerLength);
      fs.readSync(fd, header, 0, header.length, headerStart);
      const headerText = header.toString('latin1');
      if (!/['"]descr['"]\s*:\s*['"]<f4['"]/.test(headerText)
          || !/['"]fortran_order['"]\s*:\s*False/.test(headerText)
          || !headerText.includes('98335') || !headerText.includes('768')) {
        throw new Error('NPY_DTYPE_ORDER_OR_SHAPE_MISMATCH');
      }
      const rawBatch = Buffer.alloc(256 * 768 * 4);
      const databaseDigest = createHash('sha256');
      let verifiedRows = 0;
      for (let start = 0; start < ids.length; start += 256) {
        const batchIds = ids.slice(start, start + 256);
        const result = await client.query(
          `WITH requested AS (
             SELECT id, ord
             FROM unnest($1::uuid[]) WITH ORDINALITY AS r(id, ord)
           )
           SELECT requested.ord, c.id::text AS id, c.content_embedding_768::text AS embedding
           FROM requested
           JOIN public.codebase_chunk_index c ON c.id = requested.id
           ORDER BY requested.ord`,
          [batchIds],
        );
        if (result.rows.length !== batchIds.length) throw new Error(`VECTOR_READBACK_ROW_COUNT_MISMATCH:${start}`);
        const dataBytes = result.rows.length * 768 * 4;
        for (let index = 0; index < result.rows.length; index++) {
          const row = result.rows[index];
          if (row.id !== batchIds[index] || Number(row.ord) !== index + 1) throw new Error(`VECTOR_MANIFEST_ORDINAL_MISMATCH:${start + index}`);
          const valuesText = row.embedding;
          if (typeof valuesText !== 'string' || valuesText[0] !== '[' || valuesText.at(-1) !== ']') throw new Error(`VECTOR_VALUE_MISSING:${start + index}`);
          const values = valuesText.slice(1, -1).split(',');
          if (values.length !== 768) throw new Error(`VECTOR_DIMENSION_MISMATCH:${start + index}`);
          const rowOffset = index * 768 * 4;
          for (let dimension = 0; dimension < values.length; dimension++) {
            const value = Number(values[dimension]);
            if (!Number.isFinite(value)) throw new Error(`NONFINITE_DATABASE_VECTOR:${start + index}:${dimension}`);
            rawBatch.writeFloatLE(value, rowOffset + dimension * 4);
          }
        }
        const actualBytes = rawBatch.subarray(0, dataBytes);
        const expectedBytes = Buffer.alloc(dataBytes);
        fs.readSync(fd, expectedBytes, 0, dataBytes, dataOffset + start * 768 * 4);
        if (!actualBytes.equals(expectedBytes)) throw new Error(`VECTOR_PAYLOAD_MISMATCH_AT_ORDINAL:${start}`);
        databaseDigest.update(actualBytes);
        verifiedRows += result.rows.length;
      }
      const fileDigest = createHash('sha256');
      for await (const chunk of fs.createReadStream(vectorPath)) fileDigest.update(chunk);
      const report = {
        schema: 'atlas.frozen-corpus-vector-ordinal-binding.v1',
        status: 'VERIFIED_EXACT',
        verifiedRows,
        dimensions: 768,
        manifestSha256,
        workspaceRevision,
        freezeLocalOrdinalMapChecksum,
        npyArtifactSha256: fileDigest.digest('hex'),
        vectorPayloadSha256: databaseDigest.digest('hex'),
        identityBinding: 'manifest ordinal -> chunk UUID -> PostgreSQL content_embedding_768 exact float32 payload',
        canonicalCandidateOrdinalBinding: false,
        canonicalAuthority: false,
        writesPerformed: false,
      };
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ reportPath: outputPath, status: report.status, verifiedRows, writesPerformed: false }));
    } finally {
      fs.closeSync(fd);
    }
    await client.query('ROLLBACK');
    await client.end();
    process.exit(0);
  }
  const report = {
    manifestRows: manifest.length,
    manifestSha256,
    workspaceRevision,
    qualifiedRows: rows.length,
    distinctFiles,
    canonicalAuthority: false,
    writesPerformed: false,
    splitMethod: 'Within each top-level/module stratum, sort unique slash-normalized paths by SHA-256(seed || NUL || path); alternating files select test',
  };
  if (planOnly) {
    const filesByStratum = new Map();
    const partitionRows = { train: 0, test: 0 };
    for (const sourceRef of sourceRefs) {
      const pathParts = sourceRef.split('/');
      const stratum = pathParts.length >= 3 ? pathParts.slice(0, 2).join('/') : (pathParts.length > 1 ? pathParts[0] : '.');
      if (!filesByStratum.has(stratum)) filesByStratum.set(stratum, new Set());
      filesByStratum.get(stratum).add(sourceRef);
    }
    const assignments = new Map();
    for (const paths of filesByStratum.values()) {
      const orderedPaths = [...paths].sort((left, right) => {
        const leftHash = createHash('sha256').update(`20261019\0${left}`).digest();
        const rightHash = createHash('sha256').update(`20261019\0${right}`).digest();
        return Buffer.compare(leftHash, rightHash) || left.localeCompare(right);
      });
      orderedPaths.forEach((sourceRef, index) => assignments.set(sourceRef, index % 2 === 1 ? 'test' : 'train'));
    }
    for (const sourceRef of sourceRefs) {
      partitionRows[assignments.get(sourceRef)]++;
    }
    report.split = {
      trainFiles: [...assignments.values()].filter((value) => value === 'train').length,
      testFiles: [...assignments.values()].filter((value) => value === 'test').length,
      trainRows: partitionRows.train,
      testRows: partitionRows.test,
    };
    console.log(JSON.stringify(report, null, 2));
    await client.query('ROLLBACK');
    await client.end();
    process.exit(0);
  }
  const pythonArgs = nearDuplicatesRequested
    ? [
        '-3.13', '-m', 'atlas_compute.frozen_corpus_near_duplicate_review_v1',
        '--manifest-sha256', manifestSha256,
        '--workspace-revision', workspaceRevision,
        '--output', outputPath,
      ]
    : [
        '-3.13', '-m', 'atlas_compute.frozen_som_holdout_v1',
        '--manifest-sha256', manifestSha256,
        '--freeze-local-ordinal-map-checksum', freezeLocalOrdinalMapChecksum,
        '--output', outputPath,
        '--epochs', String(epochs),
        '--seeds', ...seeds.map(String),
        '--jitter', String(jitter),
      ];
  await client.query('ROLLBACK');
  await client.end();
  const pythonPath = path.join(REPO_ROOT, 'python');
  const child = spawn('py', pythonArgs, {
    cwd: REPO_ROOT,
    env: { ...process.env, PYTHONPATH: [pythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  child.stdin.end(JSON.stringify(nearDuplicatesRequested
    ? { sourceRefs, sourceRevisionByRef }
    : { sourceRefs, freezeLocalOrdinalMapChecksum }));
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`SOM_HOLDOUT_RUN_FAILED:${exitCode}`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  try { await client.end(); } catch {}
  throw error;
}
