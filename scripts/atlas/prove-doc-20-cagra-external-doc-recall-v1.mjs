#!/usr/bin/env node

/** Read-only DOC-20 CAGRA recall comparison on the DOC-19 frozen cohort. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { tableFromIPC } from 'apache-arrow';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_RECEIPT = resolve(ROOT, 'docs/reports/parent-atlas/doc-19-cuvs-external-doc-parity-v1.json');
const ARTIFACT_PATH = resolve(ROOT, 'docs/reports/parent-atlas/doc-19-cuvs-external-doc-vectors.arrow');
const REPORT_PATH = resolve(ROOT, 'docs/reports/parent-atlas/doc-20-cagra-external-doc-recall-v1.json');
const execFileAsync = promisify(execFile);
const TOP_K = 20;
const QUERY_COUNT = 64;
const ITOPK_SIZES = [64, 512];
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function main() {
  const report = {
    schema: 'atlas.doc-20.cagra-external-doc-recall.v1',
    gate: 'DOC-20',
    status: 'DOC_20_CAGRA_DOC_CORPUS_RECALL_UNPROVEN',
    sourceReceipt: relative(ROOT, SOURCE_RECEIPT).replaceAll('\\', '/'),
    cohort: null,
    sweep: [],
    promotion: false,
    canonicalAuthority: false,
    logicalLaneVote: 'NONE',
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, canonicalCorpus: 0, graphifyRuns: 0, containerRebuilds: 0 },
    filesystem: { receipt: relative(ROOT, REPORT_PATH).replaceAll('\\', '/'), writesAreNoncanonicalProofArtifacts: true },
    errors: [],
  };

  try {
    const doc19 = JSON.parse(await readFile(SOURCE_RECEIPT, 'utf8'));
    if (doc19.status !== 'DOC_19_CUVS_EXTERNAL_DOC_EXACT_PARITY_PROVEN' || doc19.cohort?.rows !== 852 || !doc19.checks?.exactTopKSetParity) {
      throw new Error(`DOC19_ORACLE_RECEIPT_NOT_PROVEN:${doc19.status}`);
    }
    const artifact = await readFile(ARTIFACT_PATH);
    const artifactChecksum = sha256(artifact);
    if (artifactChecksum !== doc19.artifactChecksum) throw new Error('DOC20_ARTIFACT_CHECKSUM_MISMATCH');
    const table = tableFromIPC(artifact);
    const ordinals = table.getChild('candidate_ordinal');
    const sourceRefs = table.getChild('source_ref');
    const revisions = table.getChild('source_revision');
    const dimensions = table.getChild('vector_dimensions');
    if (table.numRows !== 852 || !ordinals || !sourceRefs || !revisions || !dimensions) throw new Error('DOC20_ARTIFACT_IDENTITY_SCHEMA_INVALID');
    for (let i = 0; i < table.numRows; i += 1) {
      if (Number(ordinals.get(i)) !== i || !sourceRefs.get(i) || !revisions.get(i) || Number(dimensions.get(i)) !== 768) {
        throw new Error(`DOC20_ARTIFACT_ROW_IDENTITY_INVALID:${i}`);
      }
    }
    report.cohort = {
      table: 'atlas_external_doc_chunks',
      rows: table.numRows,
      dimensions: 768,
      artifactChecksum,
      sourceCorpusChecksum: doc19.corpusChecksum,
      queryCount: QUERY_COUNT,
      topK: TOP_K,
      querySampling: '64 deterministic evenly spaced corpus ordinals; self-hit excluded before recall calculation',
    };

    const python = String.raw`import json,sys,time,numpy as np,pyarrow.ipc as ipc,cupy as cp,cuvs
from cuvs.neighbors import brute_force,cagra
path=sys.argv[1]; artifact_checksum=sys.argv[2]; count=int(sys.argv[3]); top_k=int(sys.argv[4]); itopks=json.loads(sys.argv[5])
table=ipc.open_file(path).read_all(); ordinals=np.asarray(table.column('candidate_ordinal').to_pylist(),dtype=np.int32)
vectors=np.stack([np.frombuffer(blob,dtype=np.float32) for blob in table.column('vector_f32').to_pylist()]); n,d=vectors.shape
if n!=852 or d!=768 or not np.isfinite(vectors).all(): raise RuntimeError('DOC20_VECTOR_MATRIX_INVALID')
queries=np.unique(np.linspace(0,n-1,count,dtype=np.int32)); gpu=cp.asarray(vectors); q=gpu[queries]
t=time.perf_counter(); exact=brute_force.build(gpu,metric='cosine'); ed,ei=brute_force.search(exact,q,k=min(top_k+1,n)); cp.cuda.Stream.null.synchronize(); exact_ms=(time.perf_counter()-t)*1000
exact_i=cp.asnumpy(ei).astype(np.int64); exact_d=cp.asnumpy(ed); results=[]
params=cagra.IndexParams(metric='cosine'); t=time.perf_counter(); ann=cagra.build(params,gpu); cp.cuda.Stream.null.synchronize(); build_ms=(time.perf_counter()-t)*1000
for itopk in itopks:
 sp=cagra.SearchParams(itopk_size=int(itopk)); t=time.perf_counter(); ad,ai=cagra.search(sp,ann,q,min(top_k+1,n)); cp.cuda.Stream.null.synchronize(); search_ms=(time.perf_counter()-t)*1000
 ann_i=cp.asnumpy(ai).astype(np.int64); per=[]; recalls10=[]; recalls20=[]
 for qi,query_ordinal in enumerate(queries.tolist()):
  expected=[int(ordinals[j]) for j in exact_i[qi].tolist() if int(ordinals[j])!=int(query_ordinal)][:top_k]
  actual=[int(ordinals[j]) for j in ann_i[qi].tolist() if int(ordinals[j])!=int(query_ordinal)][:top_k]
  if len(expected)<top_k or len(actual)<top_k or len(set(actual))!=len(actual): raise RuntimeError('DOC20_TOPK_OR_DUPLICATE_FAILURE')
  def recall(k): return len(set(expected[:k])&set(actual[:k]))/k
  r10=recall(10); r20=recall(20); recalls10.append(r10); recalls20.append(r20); per.append({'queryOrdinal':int(query_ordinal),'recallAt10':r10,'recallAt20':r20})
 results.append({'itopkSize':int(itopk),'recallAt10':float(np.mean(recalls10)),'recallAt20':float(np.mean(recalls20)),'worstQueryRecallAt20':float(np.min(recalls20)),'queries':per,'buildMs':build_ms,'searchBatchMs':search_ms,'oracleExactMs':exact_ms})
print(json.dumps({'cuvsVersion':cuvs.__version__,'device':cp.cuda.runtime.getDeviceProperties(0).get('name',b'').decode(errors='replace'),'rows':n,'dimensions':d,'artifactChecksum':artifact_checksum,'queryCount':len(queries),'topK':top_k,'exactOracle':'cuvs.neighbors.brute_force cosine on same frozen matrix','results':results}))`;
    const { stdout } = await execFileAsync('docker', [
      'inspect', 'atlas-gpu-8098', '--format', '{{json .Mounts}}',
    ], { maxBuffer: 1024 * 1024 });
    const mounts = JSON.parse(stdout);
    const mount = mounts.find((entry) => resolve(String(entry.Source)).toLowerCase() === ROOT.toLowerCase());
    if (!mount) throw new Error('DOC20_REPOSITORY_ROOT_NOT_MOUNTED_IN_GPU_CONTAINER');
    const containerPath = `${String(mount.Destination).replace(/\/+$/, '')}/${relative(ROOT, ARTIFACT_PATH).replaceAll('\\', '/')}`;
    const execution = await execFileAsync('docker', [
      'exec', 'atlas-gpu-8098', 'python', '-c', python,
      containerPath, artifactChecksum, String(QUERY_COUNT), String(TOP_K), JSON.stringify(ITOPK_SIZES),
    ], { maxBuffer: 4 * 1024 * 1024, timeout: 180000 });
    const resultLine = execution.stdout.trim().split(/\r?\n/).at(-1);
    const gpu = JSON.parse(resultLine);
    if (gpu.rows !== 852 || gpu.dimensions !== 768 || gpu.queryCount !== QUERY_COUNT || gpu.artifactChecksum !== artifactChecksum || !gpu.device?.includes('NVIDIA')) {
      throw new Error('DOC20_GPU_RESULT_METADATA_INVALID');
    }
    report.executor = { kind: 'CUVS_CAGRA', version: gpu.cuvsVersion, device: gpu.device, invocation: 'existing atlas-gpu-8098 CuPy/cuVS runtime; no rebuild', httpApiProof: false };
    report.oracle = gpu.exactOracle;
    report.sweep = gpu.results;
    report.checks = {
      doc19ExactOracleProven: true,
      canonicalDocCohortChecksumBound: true,
      sameVectorMatrixAndQueries: true,
      defaultItopkMeasured: gpu.results.some((item) => item.itopkSize === 64),
      tunedItopkMeasured: gpu.results.some((item) => item.itopkSize === 512),
      reportsRecallAndLatency: gpu.results.every((item) => item.queries.length === QUERY_COUNT && Number.isFinite(item.recallAt20) && Number.isFinite(item.searchBatchMs)),
      noPromotionOrLogicalLaneVote: true,
    };
    report.status = Object.values(report.checks).every(Boolean)
      ? 'DOC_20_CAGRA_DOC_CORPUS_RECALL_BENCHMARK_PROVEN'
      : 'DOC_20_CAGRA_DOC_CORPUS_RECALL_FAILED';
  } catch (error) {
    report.errors.push(String(error?.message ?? error));
  }

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, cohort: report.cohort, sweep: report.sweep.map(({ itopkSize, recallAt10, recallAt20, worstQueryRecallAt20, buildMs, searchBatchMs }) => ({ itopkSize, recallAt10, recallAt20, worstQueryRecallAt20, buildMs, searchBatchMs })), errors: report.errors, receipt: report.filesystem.receipt }, null, 2));
  if (report.status !== 'DOC_20_CAGRA_DOC_CORPUS_RECALL_BENCHMARK_PROVEN') process.exitCode = 1;
}

await main();
