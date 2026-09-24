#!/usr/bin/env node

/** Read-only DOC-19 exact cuVS parity over canonical external-document vectors. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { Binary, Int32, Table, Utf8, tableToIPC, vectorFromArray } from 'apache-arrow';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ROOT = REPO_ROOT;
const OUTPUT_DIR = resolve(ROOT, 'docs/reports/parent-atlas');
const ARTIFACT_PATH = resolve(OUTPUT_DIR, 'doc-19-cuvs-external-doc-vectors.arrow');
const REPORT_PATH = resolve(OUTPUT_DIR, 'doc-19-cuvs-external-doc-parity-v1.json');
const ARTIFACT_RELATIVE = relative(ROOT, ARTIFACT_PATH).replaceAll('\\', '/');
const BASE_URL = String(process.env.ATLAS_GPU_8098_URL ?? 'http://127.0.0.1:8098').replace(/\/+$/, '');
const TOP_K = 10;
const QUERY_ORDINALS = [0, 425, 851];
const SCORE_TOLERANCE = 1e-5;
const execFileAsync = promisify(execFile);
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonicalJson = (value) => JSON.stringify(value);

function parseVector(value) {
  const vector = Array.isArray(value) ? value : JSON.parse(String(value));
  if (!Array.isArray(vector) || vector.length !== 768) throw new Error('DOC19_VECTOR_DIMENSION_NOT_768');
  const parsed = vector.map(Number);
  if (parsed.some((number) => !Number.isFinite(number))) throw new Error('DOC19_VECTOR_NONFINITE');
  const norm = Math.sqrt(parsed.reduce((sum, number) => sum + number * number, 0));
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error('DOC19_VECTOR_ZERO_NORM');
  return parsed;
}

function cosineDistance(query, candidate) {
  let dot = 0;
  let queryNorm = 0;
  let candidateNorm = 0;
  for (let index = 0; index < query.length; index += 1) {
    dot += query[index] * candidate[index];
    queryNorm += query[index] * query[index];
    candidateNorm += candidate[index] * candidate[index];
  }
  return 1 - dot / Math.sqrt(queryNorm * candidateNorm);
}

function cpuTopK(query, rows, limit) {
  return rows.map((row) => ({ ordinal: row.ordinal, distance: cosineDistance(query, row.vector) }))
    .sort((left, right) => left.distance - right.distance || left.ordinal - right.ordinal)
    .slice(0, limit);
}

async function containerArtifactPath() {
  const { stdout } = await execFileAsync('docker', ['inspect', 'atlas-gpu-8098', '--format', '{{json .Mounts}}'], { maxBuffer: 1024 * 1024 });
  const mounts = JSON.parse(stdout);
  const mount = mounts.find((entry) => resolve(String(entry.Source)).toLowerCase() === ROOT.toLowerCase());
  if (!mount) throw new Error('DOC19_REPOSITORY_ROOT_NOT_MOUNTED_IN_GPU_CONTAINER');
  return `${String(mount.Destination).replace(/\/+$/, '')}/${ARTIFACT_RELATIVE}`;
}

async function runCuvsInsideExistingContainer(artifactPath) {
  // Uses the already-installed CuPy/cuVS runtime directly. The HTTP wrapper is
  // currently missing optional torch, so this proves the executor itself but
  // explicitly does not claim the wrapper/API path is operational.
  const python = String.raw`import json,sys,numpy as np,pyarrow.ipc as ipc,cupy as cp,cuvs
from cuvs.neighbors import brute_force
path=sys.argv[1]; query_ordinals=json.loads(sys.argv[2]); top_k=int(sys.argv[3])
table=ipc.open_file(path).read_all(); ordinals=np.asarray(table.column('candidate_ordinal').to_pylist(),dtype=np.int32)
vectors=np.stack([np.frombuffer(blob,dtype=np.float32) for blob in table.column('vector_f32').to_pylist()])
if vectors.ndim!=2 or vectors.shape[1]!=768 or len(vectors)!=len(ordinals): raise RuntimeError('ARROW_VECTOR_SHAPE_INVALID')
dataset=cp.asarray(vectors); index=brute_force.build(dataset,metric='cosine'); results=[]
for ordinal in query_ordinals:
 q=cp.asarray(vectors[ordinal].reshape(1,-1)); distances,indices=brute_force.search(index,q,k=min(top_k,len(vectors)))
 ds=cp.asnumpy(distances)[0].tolist(); ix=cp.asnumpy(indices)[0].tolist()
 results.append({'queryOrdinal':ordinal,'rows':[{'ordinal':int(ordinals[int(i)]),'distance':float(d)} for i,d in zip(ix,ds)]})
print(json.dumps({'cuvsVersion':cuvs.__version__,'device':cp.cuda.runtime.getDeviceProperties(0).get('name',b'').decode(errors='replace'),'rowCount':len(vectors),'dimensions':int(vectors.shape[1]),'results':results}))`;
  const containerPath = await containerArtifactPath();
  const { stdout } = await execFileAsync('docker', [
    'exec', 'atlas-gpu-8098', 'python', '-c', python,
    containerPath, JSON.stringify(QUERY_ORDINALS), String(TOP_K),
  ], { maxBuffer: 1024 * 1024, timeout: 120000 });
  const line = stdout.trim().split(/\r?\n/).at(-1);
  return JSON.parse(line);
}

async function main() {
  const report = {
    schema: 'atlas.doc-19.cuvs-external-doc-parity.v1',
    gate: 'DOC-19',
    status: 'DOC_19_CUVS_EXTERNAL_DOC_PARITY_UNPROVEN',
    cohort: { table: 'atlas_external_doc_chunks', rows: 0, dimensions: 768, queryOrdinals: QUERY_ORDINALS, topK: TOP_K },
    corpusChecksum: null,
    artifactChecksum: null,
    parity: [],
    checks: {},
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, canonicalCorpus: 0, graphifyRuns: 0, containerRebuilds: 0 },
    filesystem: { arrowArtifact: ARTIFACT_RELATIVE, receipt: relative(ROOT, REPORT_PATH).replaceAll('\\', '/'), writesAreNoncanonicalExecutionArtifacts: true },
    canonicalAuthority: false,
    logicalLaneVote: 'NONE',
    errors: [],
  };

  let client;
  let pool;
  try {
    const databaseUrl = resolveDatabaseUrl(loadRepoEnv(process.env));
    pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 30000 });
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '25s'");
    const result = await client.query(`
      SELECT c.chunk_id, c.evidence_revision, c.chunk_checksum,
             c.content_embedding::text AS embedding,
             vector_dims(c.content_embedding) AS dimensions
      FROM atlas_external_doc_chunks AS c
      WHERE c.content_embedding IS NOT NULL
      ORDER BY c.chunk_id, c.evidence_revision
    `);
    await client.query('COMMIT');
    await client.release();
    client = null;

    const healthResponse = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    report.httpApiHealth = healthResponse.ok ? await healthResponse.json() : { ok: false, status: healthResponse.status };

    if (result.rows.length !== 852) throw new Error(`DOC19_EXPECTED_852_EMBEDDED_CHUNKS_GOT_${result.rows.length}`);
    const ids = new Set();
    const rows = result.rows.map((row, ordinal) => {
      const chunkId = String(row.chunk_id ?? '');
      const revision = String(row.evidence_revision ?? '');
      if (!chunkId || !revision || ids.has(chunkId)) throw new Error('DOC19_CHUNK_ID_OR_REVISION_INVALID_OR_DUPLICATE');
      ids.add(chunkId);
      if (Number(row.dimensions) !== 768) throw new Error(`DOC19_VECTOR_DIMENSION_MISMATCH:${chunkId}`);
      const vector = Float32Array.from(parseVector(row.embedding));
      return { ordinal, chunkId, revision, chunkChecksum: String(row.chunk_checksum ?? ''), vector: Array.from(vector) };
    });
    if (QUERY_ORDINALS.some((ordinal) => ordinal >= rows.length)) throw new Error('DOC19_QUERY_ORDINAL_OUT_OF_RANGE');

    const identityManifest = rows.map(({ ordinal, chunkId, revision, chunkChecksum }) => ({ ordinal, chunkId, revision, chunkChecksum }));
    report.cohort.rows = rows.length;
    report.corpusChecksum = digest(Buffer.from(canonicalJson(identityManifest), 'utf8'));
    report.checks = {
      readOnlyTransaction: true,
      expectedCanonicalRows: rows.length === 852,
      uniqueChunkIds: ids.size === rows.length,
      revisionQualified: rows.every((row) => row.revision.length > 0),
      dimensions768: rows.every((row) => row.vector.length === 768),
      finiteNonzeroVectors: true,
    };

    const vectorBytes = rows.map((row) => Buffer.from(Float32Array.from(row.vector).buffer));
    const table = new Table({
      candidate_ordinal: vectorFromArray(rows.map((row) => row.ordinal), new Int32()),
      source_ref: vectorFromArray(rows.map((row) => row.chunkId), new Utf8()),
      source_revision: vectorFromArray(rows.map((row) => row.revision), new Utf8()),
      tile_index: vectorFromArray(rows.map(() => 0), new Int32()),
      vector_dimensions: vectorFromArray(rows.map(() => 768), new Int32()),
      vector_f32: vectorFromArray(vectorBytes, new Binary()),
    });
    const artifactBytes = tableToIPC(table, 'file');
    report.artifactChecksum = digest(artifactBytes);
    await mkdir(dirname(ARTIFACT_PATH), { recursive: true });
    await writeFile(ARTIFACT_PATH, artifactBytes);

    const gpu = await runCuvsInsideExistingContainer(ARTIFACT_PATH);
    if (gpu.rowCount !== rows.length || gpu.dimensions !== 768 || !gpu.cuvsVersion || !gpu.device) throw new Error('DOC19_CUVS_RUNTIME_METADATA_INVALID');
    report.executor = { kind: 'CUVS_BRUTE_FORCE', version: gpu.cuvsVersion, device: gpu.device, invocation: 'docker exec into existing atlas-gpu-8098; no rebuild', executionApiProof: false, apiBlocker: 'HTTP wrapper health reports torchAvailable=false; direct library execution used without altering the running image.' };
    const parity = [];
    for (const queryOrdinal of QUERY_ORDINALS) {
      const query = rows[queryOrdinal].vector;
      const oracle = cpuTopK(query, rows, TOP_K);
      const execution = gpu.results.find((item) => item.queryOrdinal === queryOrdinal);
      if (!execution) throw new Error(`CUVS_QUERY_RESULT_MISSING:${queryOrdinal}`);
      const actual = execution.rows.map((row) => ({ ordinal: Number(row.ordinal), distance: Number(row.distance) }));
      const oracleOrdinals = oracle.map((row) => row.ordinal);
      const actualOrdinals = actual.map((row) => row.ordinal);
      if (actual.some((row) => !Number.isInteger(row.ordinal) || row.ordinal < 0 || row.ordinal >= rows.length || !Number.isFinite(row.distance))) {
        throw new Error('CUVS_RESULT_IDENTITY_OR_SCORE_INVALID');
      }
      const maxDistanceDelta = Math.max(...actual.map((row) => Math.abs(row.distance - cosineDistance(query, rows[row.ordinal].vector))));
      parity.push({
        queryOrdinal,
        queryChunkId: rows[queryOrdinal].chunkId,
        actualCount: actual.length,
        expectedCount: TOP_K,
        exactSetParity: actual.length === TOP_K && new Set(actualOrdinals).size === TOP_K && [...actualOrdinals].sort((a, b) => a - b).join(',') === [...oracleOrdinals].sort((a, b) => a - b).join(','),
        exactRankParity: actualOrdinals.join(',') === oracleOrdinals.join(','),
        maxDistanceDelta,
        scoreTolerance: SCORE_TOLERANCE,
        withinScoreTolerance: maxDistanceDelta <= SCORE_TOLERANCE,
      });
    }
    report.parity = parity;
    report.checks.liveCudaExecutor = gpu.device.includes('NVIDIA');
    report.checks.artifactReadbackChecksum = digest(await readFile(ARTIFACT_PATH)) === report.artifactChecksum;
    report.checks.exactTopKSetParity = parity.every((item) => item.exactSetParity);
    report.checks.exactTopKRankParity = parity.every((item) => item.exactRankParity);
    report.checks.distanceParity = parity.every((item) => item.withinScoreTolerance);
    report.checks.executionOnlyNoCanonicalAuthority = true;
    report.status = Object.values(report.checks).every(Boolean)
      ? 'DOC_19_CUVS_EXTERNAL_DOC_EXACT_PARITY_PROVEN'
      : 'DOC_19_CUVS_EXTERNAL_DOC_PARITY_FAILED';
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* read-only connection cleanup */ }
      client.release();
    }
    report.errors.push(String(error?.message ?? error));
  }
  if (pool) await pool.end();

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, cohort: report.cohort, parity: report.parity, errors: report.errors, receipt: report.filesystem.receipt }, null, 2));
  if (report.status !== 'DOC_19_CUVS_EXTERNAL_DOC_EXACT_PARITY_PROVEN') process.exitCode = 1;
}

await main();
