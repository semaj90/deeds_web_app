import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createAtlasSearchAdapter } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-adapter.js';

const root = resolve(import.meta.dirname, '../..');
const reportPath = resolve(root, 'docs/reports/unified-residency-searchruntime-duckdb-wsl-v1.json');
const pythonRoot = '/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python';
const python = '/home/james/.venvs/atlas-cutile-cu132/bin/python';

function frame(descriptor: Record<string, unknown>, values: readonly number[], queryValues: readonly number[] = []) {
  const control = Buffer.from(JSON.stringify(descriptor), 'utf8');
  const numeric = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => numeric.writeFloatLE(value, index * 4));
  const controlLength = Buffer.alloc(4);
  controlLength.writeUInt32BE(control.length, 0);
  const numericLength = Buffer.alloc(8);
  numericLength.writeBigUInt64BE(BigInt(numeric.length), 0);
  const query = Buffer.alloc(queryValues.length * 4);
  queryValues.forEach((value, index) => query.writeFloatLE(value, index * 4));
  if (!queryValues.length) return Buffer.concat([controlLength, control, numericLength, numeric]);
  const queryLength = Buffer.alloc(8);
  queryLength.writeBigUInt64BE(BigInt(query.length), 0);
  return Buffer.concat([controlLength, control, numericLength, numeric, queryLength, query]);
}

function cpuExactCosine(values: readonly number[], query: readonly number[], dimensions: number) {
  const rows = Math.floor(values.length / dimensions);
  const queryNorm = Math.sqrt(query.reduce((sum, value) => sum + value * value, 0));
  const scores = Array.from({ length: rows }, (_, row) => {
    const offset = row * dimensions;
    const dot = query.reduce((sum, value, index) => sum + values[offset + index] * value, 0);
    const rowNorm = Math.sqrt(values.slice(offset, offset + dimensions).reduce((sum, value) => sum + value * value, 0));
    return dot / (rowNorm * queryNorm);
  });
  const indices = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 1);
  return { indices: indices.map(({ index }) => index), scores: indices.map(({ score }) => Number(score.toFixed(6))) };
}

async function stageWithDuckDb(values: readonly number[]) {
  const duckdbModule = await import('duckdb');
  const Database = duckdbModule.default?.Database ?? duckdbModule.Database;
  if (!Database) throw new Error('DUCKDB_DATABASE_CLASS_UNAVAILABLE');
  const database = new Database(':memory:');
  const connection = database.connect();
  try {
    const columns = values.map((_, index) => `f${index}`).join(', ');
    const row = values.map((value) => {
      if (!Number.isFinite(value)) throw new Error('DUCKDB_NONFINITE_FEATURE_VALUE');
      return String(value);
    }).join(', ');
    const query = `SELECT * FROM (VALUES (${row})) AS t(${columns})`;
    const rows = await new Promise<Array<Record<string, number>>>((resolveRows, rejectRows) => {
      connection.all(query, (error, result) => error ? rejectRows(error) : resolveRows(result ?? []));
    });
    if (rows.length !== 1) throw new Error('DUCKDB_STAGE_ROW_COUNT_MISMATCH');
    return values.map((_, index) => Number(rows[0][`f${index}`]));
  } finally {
    connection.close();
    database.close();
  }
}

function run(input: Buffer) {
  return new Promise<{ code: number | null; stdout: Buffer; stderr: Buffer }>((resolveRun, rejectRun) => {
    const child = spawn('wsl.exe', [
      '-d', 'Ubuntu', '--', 'bash', '-lc',
      `cd ${pythonRoot} && ATLAS_UNIFIED_RESIDENCY_DEVICE=cuda PYTHONPATH=. ${python} -m parent_atlas_tensor.unified_residency_stdio`,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
    child.stdin.end(input);
  });
}

const adapter = createAtlasSearchAdapter({
  runtime: {
    search: async () => ({
      packets: [{
        chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
        symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
        workspace_revision: 'workspace:r1', source_revision: 'source:r1',
        representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
      }],
      metadata: {}, provenance: {},
    } as any),
  },
});

const options = {
  requestId: 'request:residency-e2e', policyRevision: 'policy:r1', workspaceRevision: 'workspace:r1',
  representationRevision: 'semantic_768:r1', candidateSnapshotRevision: 'snapshot:search:r1',
  retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'ace-playbook:r1', tokenBudget: 1200,
  producerRevision: 'search-snapshot:r1', laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
  domain: 'contracts', lutRevision: 'lut:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', ropeRevision: 'rope:r1',
  rowAlignment: 2,
  lut: { contracts: { lutRevision: 'lut:r1', tokenBudget: 1200, featureMask: ['semantic'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } },
  sources: {
    projection: () => ({ packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8, ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5, recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1 }),
    context: () => ({ graphRevision: 'graph:r1', featureRevision: 'features:r1', representationRevision: 'semantic_768:r1', taskKind: 'DEBUG', features: { semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0, processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0, reuseProbability: 0, recency: 0 } }),
  },
} as any;

const searchResult = await adapter.searchWithUnifiedResidencyFeaturePack({ query: 'inspect', topK: 1 }, options);
const residency = searchResult.residencies[0];
if (!residency) throw new Error('SEARCH_RUNTIME_RESIDENCY_EMPTY');
const sourceValues = Array.from(residency.featureBuffer);
const stagedValues = await stageWithDuckDb(sourceValues);
const cpuExpected = cpuExactCosine(stagedValues, stagedValues, stagedValues.length);
const descriptor = {
  ...(residency.descriptor as unknown as Record<string, unknown>),
  operation: 'EXACT_COSINE_V1',
  queryShape: [stagedValues.length],
  topK: 1,
};
const stagedFrame = frame(descriptor, stagedValues, stagedValues);
const handoff = await run(stagedFrame);
const rejectedDescriptor = { ...descriptor, residencyKey: 'atlas:residency:stale-query-shape', queryShape: [stagedValues.length + 1] };
const rejected = await run(frame(rejectedDescriptor, stagedValues, stagedValues));
let receipt: Record<string, unknown> | null = null;
let parseError: string | null = null;
try { receipt = JSON.parse(handoff.stdout.toString('utf8').trim()); } catch (error) { parseError = String(error); }
let rejectedReceipt: Record<string, unknown> | null = null;
try { rejectedReceipt = JSON.parse(rejected.stdout.toString('utf8').trim()); } catch { /* primary receipt remains authoritative */ }

const report = {
  schema: 'atlas.unified-residency-searchruntime-duckdb-wsl.v1',
  status: handoff.code === 0 && receipt?.state === 'RESIDENT' && receipt?.writesPerformed === false
      && Array.isArray(receipt?.indices) && receipt.indices[0] === 0
      && Array.isArray(receipt?.scores) && Math.abs(Number(receipt.scores[0]) - 1) < 1e-5
      && JSON.stringify(receipt.indices) === JSON.stringify(cpuExpected.indices)
      && JSON.stringify(receipt.scores) === JSON.stringify(cpuExpected.scores)
      && rejected.code !== 0 && rejectedReceipt?.state === 'FAILED' && rejectedReceipt?.writesPerformed === false
    ? 'SEARCHRUNTIME_DUCKDB_WSL_HANDOFF_PROVEN' : 'SEARCHRUNTIME_DUCKDB_WSL_HANDOFF_BLOCKED',
  stages: {
    searchRuntime: 'PROVEN_BOUNDED_FIXTURE',
    aceAdmission: searchResult.canonicalAuthority === false ? 'READ_ONLY' : 'BLOCKED',
    featurePackRows: searchResult.residencies.length,
    duckdb: 'IN_MEMORY_READ_ONLY_SELECT',
    wslProvider: receipt?.state ?? 'NOT_PROVEN',
    numericalParity: receipt?.indices?.[0] === 0 && Math.abs(Number(receipt?.scores?.[0]) - 1) < 1e-5 ? 'EXACT_COSINE_PROVEN' : 'NOT_PROVEN',
    staleQueryRejected: rejected.code !== 0 && rejectedReceipt?.state === 'FAILED' && rejectedReceipt?.writesPerformed === false ? 'FAIL_CLOSED_PROVEN' : 'NOT_PROVEN',
  },
  lineage: {
    workspaceRevision: descriptor.workspaceRevision,
    sourceRevision: descriptor.sourceRevision,
    representationRevision: descriptor.representationRevision,
    featureRevision: descriptor.featureRevision,
    candidateOrdinal: descriptor.candidateOrdinal,
  },
  checksums: {
    sourceFeatureValues: createHash('sha256').update(Buffer.from(residency.featureBuffer.buffer)).digest('hex'),
    stagedFeatureValues: createHash('sha256').update(Buffer.from(Float32Array.from(stagedValues).buffer)).digest('hex'),
    framedTransport: createHash('sha256').update(stagedFrame).digest('hex'),
  },
  cpuOracle: cpuExpected,
  receipt: receipt ? { state: receipt.state, device: receipt.device, byteLength: receipt.byteLength, rawPointerExposed: receipt.rawPointerExposed, writesPerformed: receipt.writesPerformed, operation: receipt.operation, indices: receipt.indices, scores: receipt.scores, resultChecksum: receipt.resultChecksum } : null,
  negativeCase: rejectedReceipt ? { state: rejectedReceipt.state, error: rejectedReceipt.error, processExitCode: rejected.code, writesPerformed: rejectedReceipt.writesPerformed } : { processExitCode: rejected.code },
  processExitCode: handoff.code,
  stderr: handoff.stderr.toString('utf8').trim(),
  parseError,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionEligible: false,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (report.status !== 'SEARCHRUNTIME_DUCKDB_WSL_HANDOFF_PROVEN') process.exitCode = 1;
