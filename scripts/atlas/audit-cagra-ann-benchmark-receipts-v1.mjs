import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'docs', 'reports');

function readJson(name) {
  const file = path.join(reportDir, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const runtime = readJson('gpu-knn-cagra-runtime-proof.json');
const semantic768 = readJson('gpu-mini-fabric-01-graph-ann-03-semantic-768.json');
const buildIsolation = readJson('gpu-mini-fabric-01-graph-ann-02-build-isolation.json');

const report = {
  schema: 'atlas.cagra-ann-benchmark-receipts.v1',
  generatedAt: new Date().toISOString(),
  status: 'BENCHMARK_RECEIPTS_CONSOLIDATED_CHALLENGER_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
  executor: 'cuVS CAGRA',
  benchmarks: {
    semantic768Historical: semantic768
      ? {
          sourceReport: 'gpu-mini-fabric-01-graph-ann-03-semantic-768.json',
          corpusRows: semantic768.n,
          dimensions: semantic768.dim,
          recallAt1: semantic768.cagra_itopk_512_tuned?.recall_at_1 ?? null,
          recallAt8: semantic768.cagra_itopk_512_tuned?.recall_at_8 ?? null,
          recallAt16: semantic768.cagra_itopk_512_tuned?.recall_at_16 ?? null,
          exactOracleAgreement: semantic768.oracle_cross_check?.cuvs_vs_pytorch_agreement ?? null,
          buildMs: semantic768.cagra_itopk_512_tuned?.build_ms ?? null,
          searchMsTotal: semantic768.cagra_itopk_512_tuned?.search_ms_total ?? null,
          identityManifest: semantic768.source_manifest?.vectors_checksum ?? null,
          vramRecorded: false,
          loadCostRecorded: false,
          explicitNeighborOverlapRecorded: false,
        }
      : null,
    buildIsolation: buildIsolation
      ? {
          sourceReport: 'gpu-mini-fabric-01-graph-ann-02-build-isolation.json',
          corpusRows: buildIsolation.n,
          dimensions: buildIsolation.fixture?.dim ?? null,
          variants: ['ivf_pq', 'nn_descent'].map((name) => {
            const value = buildIsolation[`02a_${name}`] ?? buildIsolation[`02b_${name}`];
            return {
              name,
              recallAt1: value?.recall_at_1 ?? null,
              recallAt16: value?.recall_at_16 ?? null,
              buildMs: value?.cagra_build_receipt_v1?.buildTimeMs ?? null,
              searchMsTotal: value?.search_ms_total ?? null,
              peakVramMiB: value?.cagra_build_receipt_v1?.peakVramDuringBuildUsedMib ?? null,
            };
          }),
        }
      : null,
    tinyRuntime: runtime
      ? {
          sourceReport: 'gpu-knn-cagra-runtime-proof.json',
          corpusRows: runtime.corpusRows,
          dimensions: runtime.dimension,
          recallAt3: runtime.queries?.map((query) => query.recallAt3) ?? [],
          identityParity: runtime.queries?.every((query) => query.identityParity === true) ?? false,
          exactMs: runtime.queries?.map((query) => query.exactMs) ?? [],
          cagraMs: runtime.queries?.map((query) => query.cagraMs) ?? [],
        }
      : null,
  },
  missingForAnn04: [
    'semantic_768 explicit neighbor-overlap receipt',
    'semantic_768 load-cost receipt',
    'semantic_768 peak-VRAM receipt',
  ],
  interpretation:
    'Receipts are retained by fixture and representation. No result authorizes current-corpus ANN promotion or an additional semantic vote.',
};

fs.writeFileSync(
  path.join(reportDir, 'cagra-ann-benchmark-receipts-v1.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({
  status: report.status,
  semantic768Rows: report.benchmarks.semantic768Historical?.corpusRows ?? 0,
  missingForAnn04: report.missingForAnn04,
  writesPerformed: report.writesPerformed,
}, null, 2));
