import fs from 'node:fs/promises';
import path from 'node:path';

import { materializeCandidateOrdinalMap } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../../src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import {
  gatherCandidateFeatureGpuRows,
  materializeCandidateFeatureGpuPack,
} from '../../src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.js';
import { verifyCandidateFeatureGpuParity } from '../../src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.js';

function parseArg(name: string, fallback: string): string {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const outputArg = parseArg('output', 'tmp/candidate-feature-gpu-parity-input.json');

const candidateSnapshotRevision = 'candidate-snapshot:gpu-proof:v1';
const workspaceRevision = 'workspace:gpu-proof:v1';
const featureRevision = 'candidate-features:gpu-proof:v1';
const producerRevision = 'candidate-gpu-proof:v1';

const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision,
  workspaceRevision,
  producerRevision,
  candidates: [
    {
      canonicalId: 'candidate:gamma', packetKey: 'packet:gamma', treeNodeId: 'tree:gamma', symbolVersionId: 'symbol:gamma',
      workspaceRevision, sourceRevision: 'source:gamma:v1', graphRevision: 'graph:gpu-proof:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false, evidenceRefs: ['proof:gamma'],
    },
    {
      canonicalId: 'candidate:alpha', packetKey: 'packet:alpha', treeNodeId: 'tree:alpha', symbolVersionId: 'symbol:alpha',
      workspaceRevision, sourceRevision: 'source:alpha:v1', graphRevision: 'graph:gpu-proof:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false, evidenceRefs: ['proof:alpha'],
    },
    {
      canonicalId: 'candidate:beta', packetKey: 'packet:beta', treeNodeId: 'tree:beta', symbolVersionId: 'symbol:beta',
      workspaceRevision, sourceRevision: 'source:beta:v1', graphRevision: 'graph:gpu-proof:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: true, evidenceRefs: ['proof:beta'],
    },
  ],
});

const ordinalById = new Map(ordinalMap.candidates.map((row) => [row.canonicalId, row.candidateOrdinal]));
function candidateRow(
  canonicalId: 'candidate:alpha' | 'candidate:beta' | 'candidate:gamma',
  values: {
    semanticRelevance: number;
    lexicalRelevance?: number | null;
    astAffinity?: number | null;
    graphAuthority?: number | null;
    personalizedPageRank?: number | null;
    communityAffinity?: number | null;
    domainAffinity?: number | null;
    executionUtility?: number | null;
    memoryUtility?: number | null;
  },
  laneMask: Array<'semantic' | 'lexical' | 'ast' | 'graph' | 'domain' | 'execution' | 'memory'>,
  degradedIdentity = false,
) {
  const suffix = canonicalId.split(':')[1]!;
  return {
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: ordinalById.get(canonicalId)!,
    canonicalId,
    packetKey: `packet:${suffix}`,
    treeNodeId: `tree:${suffix}`,
    symbolVersionId: `symbol:${suffix}`,
    workspaceRevision,
    sourceRevision: `source:${suffix}:v1`,
    graphRevision: 'graph:gpu-proof:v1',
    semanticRevision: 'semantic:768:v1',
    featureRevision,
    semanticRelevance: values.semanticRelevance,
    lexicalRelevance: values.lexicalRelevance ?? null,
    astAffinity: values.astAffinity ?? null,
    graphAuthority: values.graphAuthority ?? null,
    personalizedPageRank: values.personalizedPageRank ?? null,
    communityAffinity: values.communityAffinity ?? null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: values.domainAffinity ?? null,
    executionUtility: values.executionUtility ?? null,
    memoryUtility: values.memoryUtility ?? null,
    laneMask,
    degradedIdentity,
    evidenceRefs: [`proof:${suffix}`],
  };
}

const snapshot = materializeCandidateFeatureSnapshot({
  ordinalMap,
  featureRevision,
  producerRevision,
  rows: [
    candidateRow('candidate:gamma', { semanticRelevance: 0.25, lexicalRelevance: 0 }, ['semantic', 'lexical']),
    candidateRow('candidate:alpha', { semanticRelevance: 1, astAffinity: 0.75, memoryUtility: 0 }, ['semantic', 'ast', 'memory']),
    candidateRow('candidate:beta', { semanticRelevance: 0.5, graphAuthority: 0.4, personalizedPageRank: 0.1, domainAffinity: 0.2 }, ['semantic', 'graph', 'domain'], true),
  ],
});

const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision });
const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 32, producerRevision });
const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [2, 0], producerRevision });
const cpuReceipt = verifyCandidateFeatureGpuParity({ columnar, pack, gather, producerRevision });

if (pack.logicalRows !== 3 || pack.physicalRows !== 32 || pack.paddingRows !== 29) {
  throw new Error(`CANDIDATE_FEATURE_GPU_PROOF_PADDING_MISMATCH:${pack.logicalRows}:${pack.physicalRows}:${pack.paddingRows}`);
}
if (pack.validMask.slice(0, 3).some((value) => value !== 1) || pack.validMask.slice(3).some((value) => value !== 0)) {
  throw new Error('CANDIDATE_FEATURE_GPU_PROOF_VALID_MASK_MISMATCH');
}
if (cpuReceipt.gpuExecutionObserved !== false || cpuReceipt.challenger !== 'CPU_PACK_REFERENCE') {
  throw new Error('CANDIDATE_FEATURE_GPU_PROOF_CPU_RECEIPT_OVERCLAIM');
}

const outputPath = path.resolve(outputArg);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ columnar, pack, gather }, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  schema: 'atlas.candidate-feature-gpu-pack-proof.v1',
  status: 'CANDIDATE_FEATURE_GPU_PACK_BOUNDED_PROVEN',
  outputPath,
  candidateSnapshotRevision,
  ordinalMapChecksum: columnar.ordinalMapChecksum,
  featureSnapshotChecksum: columnar.featureSnapshotChecksum,
  columnarChecksum: columnar.columnarChecksum,
  gpuPackChecksum: pack.gpuPackChecksum,
  gatherChecksum: gather.gatherChecksum,
  logicalRows: pack.logicalRows,
  physicalRows: pack.physicalRows,
  paddingRows: pack.paddingRows,
  rowAlignment: pack.rowAlignment,
  selectedOrdinals: gather.selectedOrdinals,
  cpuPackParityChecksum: cpuReceipt.parityChecksum,
  cpuPackParityProven: true,
  gpuExecutionObserved: false,
  storeWrites: false,
  identityAuthority: false,
  canonicalOwnerChanged: false,
  nextCommand: `python scripts/atlas/prove-candidate-feature-gpu-parity.py --input=${outputPath.replace(/\\/g, '/')}`,
}, null, 2));
