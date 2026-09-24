#!/usr/bin/env node

/** Read-only DOC-21 IVF-PQ K0 candidate generation followed by exact refinement. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { tableFromIPC } from 'apache-arrow';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_RECEIPT = resolve(ROOT, 'docs/reports/parent-atlas/doc-19-cuvs-external-doc-parity-v1.json');
const ARTIFACT_PATH = resolve(ROOT, 'docs/reports/parent-atlas/doc-19-cuvs-external-doc-vectors.arrow');
const REPORT_PATH = resolve(ROOT, 'docs/reports/parent-atlas/doc-21-ivfpq-exact-refinement-v1.json');
const execFileAsync = promisify(execFile);
const QUERY_COUNT = 64;
const K0 = 80;
const FINAL_K = 20;
const CONFIGS = [
  { nLists: 1, nProbes: 1, pqDim: 96, pqBits: 8 },
  { nLists: 1, nProbes: 1, pqDim: 192, pqBits: 8 },
];
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function main() {
  const report = {
    schema: 'atlas.doc-21.ivfpq-exact-refinement.v1',
    gate: 'DOC-21',
    status: 'DOC_21_IVFPQ_EXACT_REFINEMENT_UNPROVEN',
    sourceReceipt: relative(ROOT, SOURCE_RECEIPT).replaceAll('\\', '/'),
    cohort: null,
    pipeline: { stages: ['IVF_PQ_CANDIDATE_GENERATION', 'EXACT_COSINE_RERANK'], candidateK0: K0, finalK: FINAL_K },
    configs: [],
    promotion: false,
    canonicalAuthority: false,
    logicalLaneVote: 'NONE',
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, canonicalCorpus: 0, graphifyRuns: 0, containerRebuilds: 0 },
    filesystem: { receipt: relative(ROOT, REPORT_PATH).replaceAll('\\', '/'), writesAreNoncanonicalProofArtifacts: true },
    errors: [],
  };

  try {
    const doc19 = JSON.parse(await readFile(SOURCE_RECEIPT, 'utf8'));
    if (doc19.status !== 'DOC_19_CUVS_EXTERNAL_DOC_EXACT_PARITY_PROVEN' || doc19.cohort?.rows !== 852) {
      throw new Error(`DOC19_ORACLE_RECEIPT_NOT_PROVEN:${doc19.status}`);
    }
    const artifact = await readFile(ARTIFACT_PATH);
    const artifactChecksum = sha256(artifact);
    if (artifactChecksum !== doc19.artifactChecksum) throw new Error('DOC21_ARTIFACT_CHECKSUM_MISMATCH');
    const table = tableFromIPC(artifact);
    const ordinals = table.getChild('candidate_ordinal');
    const sourceRefs = table.getChild('source_ref');
    const revisions = table.getChild('source_revision');
    if (table.numRows !== 852 || !ordinals || !sourceRefs || !revisions) throw new Error('DOC21_ARTIFACT_IDENTITY_SCHEMA_INVALID');
    for (let i = 0; i < table.numRows; i += 1) {
      if (Number(ordinals.get(i)) !== i || !sourceRefs.get(i) || !revisions.get(i)) throw new Error(`DOC21_ARTIFACT_ROW_IDENTITY_INVALID:${i}`);
    }
    report.cohort = {
      rows: table.numRows,
      dimensions: 768,
      artifactChecksum,
      sourceCorpusChecksum: doc19.corpusChecksum,
      queryCount: QUERY_COUNT,
      querySampling: '64 deterministic evenly spaced corpus vectors; self-hit excluded from exact-oracle comparison',
    };

    const python = String.raw`import json,sys,time,numpy as np,pyarrow.ipc as ipc,cupy as cp,cuvs
from cuvs.neighbors import brute_force,ivf_pq
path=sys.argv[1]; artifact_checksum=sys.argv[2]; query_count=int(sys.argv[3]); k0=int(sys.argv[4]); final_k=int(sys.argv[5]); configs=json.loads(sys.argv[6])
table=ipc.open_file(path).read_all(); ordinals=np.asarray(table.column('candidate_ordinal').to_pylist(),dtype=np.int32)
vectors=np.stack([np.frombuffer(blob,dtype=np.float32) for blob in table.column('vector_f32').to_pylist()]); n,d=vectors.shape
if n!=852 or d!=768 or not np.isfinite(vectors).all(): raise RuntimeError('DOC21_VECTOR_MATRIX_INVALID')
queries=np.unique(np.linspace(0,n-1,query_count,dtype=np.int32)); norms=np.linalg.norm(vectors,axis=1); normalized=vectors/np.maximum(norms[:,None],1e-12)
gpu=cp.asarray(vectors); q=gpu[queries]; exact=brute_force.build(gpu,metric='cosine'); ed,ei=brute_force.search(exact,q,k=min(final_k+1,n)); cp.cuda.Stream.null.synchronize()
exact_i=cp.asnumpy(ei).astype(np.int64); results=[]
for cfg in configs:
 params=ivf_pq.IndexParams(n_lists=int(cfg['nLists']),metric='cosine',pq_bits=int(cfg['pqBits']),pq_dim=int(cfg['pqDim']),kmeans_trainset_fraction=1.0,add_data_on_build=True)
 t=time.perf_counter(); index=ivf_pq.build(params,gpu); cp.cuda.Stream.null.synchronize(); build_ms=(time.perf_counter()-t)*1000
 search=ivf_pq.SearchParams(n_probes=int(cfg['nProbes'])); t=time.perf_counter(); approx_dist,approx_idx=ivf_pq.search(search,index,q,k0); cp.cuda.Stream.null.synchronize(); candidate_ms=(time.perf_counter()-t)*1000
 candidate_indices=cp.asnumpy(approx_idx).astype(np.int64); per=[]; pool10=[]; pool20=[]; rank10=[]; rank20=[]; refined10=[]; refined20=[]; oracle_parity=[]
 for qi,query_ordinal in enumerate(queries.tolist()):
  raw=[int(i) for i in candidate_indices[qi].tolist()]
  if any(i<0 or i>=n for i in raw) or len(set(raw))!=k0: raise RuntimeError('DOC21_CANDIDATE_IDENTITY_INVALID')
  candidates=[i for i in raw if i!=int(query_ordinal)]
  qvec=normalized[int(query_ordinal)]; exact_order=np.argsort(1.0-normalized@qvec,kind='stable')
  expected=[int(i) for i in exact_order.tolist() if int(i)!=int(query_ordinal)][:final_k]
  cuda_expected=[int(i) for i in exact_i[qi].tolist() if int(i)!=int(query_ordinal)][:final_k]
  if len(candidates)<final_k or len(expected)!=final_k or len(cuda_expected)!=final_k: raise RuntimeError('DOC21_TOPK_UNDERFILLED')
  exact_candidate_scores=normalized[candidates]@qvec; refined=[candidates[j] for j in np.argsort(-exact_candidate_scores,kind='stable')[:final_k].tolist()]
  def recall(ref,got,k): return len(set(ref[:k])&set(got[:k]))/k
  pool=set(candidates); p10=len(set(expected[:10])&pool)/10; p20=len(set(expected[:20])&pool)/20
  r10=recall(expected,refined,10); r20=recall(expected,refined,20); a10=recall(expected,candidates,10); a20=recall(expected,candidates,20)
  pool10.append(p10); pool20.append(p20); rank10.append(a10); rank20.append(a20); refined10.append(r10); refined20.append(r20)
  oracle_parity.append(set(expected)==set(cuda_expected))
  per.append({'queryOrdinal':int(query_ordinal),'candidatePoolRecallAt10':p10,'candidatePoolRecallAt20':p20,'candidateRankRecallAt10':a10,'candidateRankRecallAt20':a20,'refinedRecallAt10':r10,'refinedRecallAt20':r20,'exactCpuCudaSetParity':set(expected)==set(cuda_expected)})
 results.append({'config':cfg,'candidateK0':k0,'finalK':final_k,'candidatePoolRecallAt10':float(np.mean(pool10)),'candidatePoolRecallAt20':float(np.mean(pool20)),'candidateRankRecallAt10':float(np.mean(rank10)),'candidateRankRecallAt20':float(np.mean(rank20)),'refinedRecallAt10':float(np.mean(refined10)),'refinedRecallAt20':float(np.mean(refined20)),'worstQueryRefinedRecallAt20':float(np.min(refined20)),'exactCpuCudaSetParity':bool(all(oracle_parity)),'buildMs':build_ms,'candidateSearchBatchMs':candidate_ms,'queries':per})
print(json.dumps({'cuvsVersion':cuvs.__version__,'device':cp.cuda.runtime.getDeviceProperties(0).get('name',b'').decode(errors='replace'),'rows':n,'dimensions':d,'artifactChecksum':artifact_checksum,'queryCount':len(queries),'exactOracle':'cuVS brute-force plus independent NumPy cosine','results':results}))`;

    const { stdout: mountOutput } = await execFileAsync('docker', ['inspect', 'atlas-gpu-8098', '--format', '{{json .Mounts}}'], { maxBuffer: 1024 * 1024 });
    const mount = JSON.parse(mountOutput).find((entry) => resolve(String(entry.Source)).toLowerCase() === ROOT.toLowerCase());
    if (!mount) throw new Error('DOC21_REPOSITORY_ROOT_NOT_MOUNTED_IN_GPU_CONTAINER');
    const artifactRelative = relative(ROOT, ARTIFACT_PATH).replaceAll('\\', '/');
    const containerPath = `${String(mount.Destination).replace(/\/+$/, '')}/${artifactRelative}`;
    const { stdout } = await execFileAsync('docker', [
      'exec', 'atlas-gpu-8098', 'python', '-c', python,
      containerPath, artifactChecksum, String(QUERY_COUNT), String(K0), String(FINAL_K), JSON.stringify(CONFIGS),
    ], { maxBuffer: 6 * 1024 * 1024, timeout: 180000 });
    const execution = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    if (execution.rows !== 852 || execution.dimensions !== 768 || execution.queryCount !== QUERY_COUNT || execution.artifactChecksum !== artifactChecksum || !execution.device?.includes('NVIDIA')) {
      throw new Error('DOC21_GPU_RESULT_METADATA_INVALID');
    }
    report.executor = { kind: 'CUVS_IVF_PQ', version: execution.cuvsVersion, device: execution.device, invocation: 'existing atlas-gpu-8098 CuPy/cuVS runtime; no rebuild', httpApiProof: false };
    report.oracle = execution.exactOracle;
    report.configs = execution.results;
    report.checks = {
      doc19ExactOracleProven: true,
      cohortChecksumBound: true,
      identityAndRevisionMapRetained: true,
      standaloneIvfPqCandidateGeneration: execution.results.length === CONFIGS.length,
      candidateCountK0: execution.results.every((item) => item.candidateK0 === K0 && item.queries.length === QUERY_COUNT),
      exactRefinementRuns: execution.results.every((item) => item.finalK === FINAL_K && Number.isFinite(item.refinedRecallAt20)),
      independentCpuAndCudaOracleSetParity: execution.results.every((item) => item.exactCpuCudaSetParity),
      noPromotionOrLogicalLaneVote: true,
    };
    report.status = Object.values(report.checks).every(Boolean)
      ? 'DOC_21_IVFPQ_EXACT_REFINEMENT_BENCHMARK_PROVEN'
      : 'DOC_21_IVFPQ_EXACT_REFINEMENT_BENCHMARK_FAILED';
  } catch (error) {
    report.errors.push(String(error?.message ?? error));
  }

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, cohort: report.cohort, configs: report.configs.map(({ config, candidatePoolRecallAt20, candidateRankRecallAt20, refinedRecallAt20, worstQueryRefinedRecallAt20, buildMs, candidateSearchBatchMs }) => ({ config, candidatePoolRecallAt20, candidateRankRecallAt20, refinedRecallAt20, worstQueryRefinedRecallAt20, buildMs, candidateSearchBatchMs })), errors: report.errors, receipt: report.filesystem.receipt }, null, 2));
  if (report.status !== 'DOC_21_IVFPQ_EXACT_REFINEMENT_BENCHMARK_PROVEN') process.exitCode = 1;
}

await main();
