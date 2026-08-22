import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { materializeCandidateOrdinalMap } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../../src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import {
  gatherCandidateFeatureGpuRows,
  materializeCandidateFeatureGpuPack,
} from '../../src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.js';
import { verifyCandidateFeatureGpuParity } from '../../src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.js';

const PRODUCER_REVISION = 'candidate-feature-gpu-parity-proof:2026-08-21:v2';
type LaneName = 'semantic' | 'lexical' | 'ast' | 'graph' | 'manifold4' | 'cross_encoder' | 'domain' | 'execution' | 'memory';

type CudaObservation = {
  schema: 'atlas.candidate-feature-gpu-cuda-proof.v1';
  status: string;
  gpuExecutionObserved: boolean;
  challenger: 'PYTORCH_CUDA';
  candidateSnapshotRevision?: string;
  ordinalMapChecksum?: string;
  featureSnapshotChecksum?: string;
  columnarChecksum?: string;
  gpuPackChecksum: string;
  gatherChecksum: string;
  selectedOrdinals: number[];
  observed?: {
    selectedOrdinals: number[];
    featureValues: number[];
    featurePresence: number[];
    laneMaskU16: number[];
    degradedIdentity: number[];
  };
  maxAbsFeatureDelta?: number;
  blocker?: string;
  torchVersion?: string;
  cudaVersion?: string | null;
  deviceName?: string;
};

function buildFixture() {
  const candidateSnapshotRevision = 'candidate-snapshot:gpu-proof:v1';
  const workspaceRevision = 'workspace:gpu-proof:v1';
  const featureRevision = 'features:gpu-proof:v1';
  const graphRevision = 'graph:gpu-proof:v1';
  const semanticRevision = 'semantic:768:v1';

  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: PRODUCER_REVISION,
    candidates: [
      {
        canonicalId: 'candidate:c', packetKey: 'packet:c', treeNodeId: 'tree:c', symbolVersionId: 'symbol:c',
        workspaceRevision, sourceRevision: 'source:c:v1', graphRevision, semanticRevision, degradedIdentity: false, evidenceRefs: ['proof:c'],
      },
      {
        canonicalId: 'candidate:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a',
        workspaceRevision, sourceRevision: 'source:a:v1', graphRevision, semanticRevision, degradedIdentity: false, evidenceRefs: ['proof:a'],
      },
      {
        canonicalId: 'candidate:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b',
        workspaceRevision, sourceRevision: 'source:b:v1', graphRevision, semanticRevision, degradedIdentity: true, evidenceRefs: ['proof:b'],
      },
    ],
  });

  const rows = ordinalMap.candidates.map((candidate) => {
    const ordinal = candidate.candidateOrdinal;
    const laneMask: LaneName[] = ['semantic', 'ast', 'graph', 'domain', 'execution', 'memory'];
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: ordinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision,
      featureRevision,
      semanticRelevance: ordinal === 0 ? 0 : 0.25 * (ordinal + 1),
      lexicalRelevance: ordinal === 1 ? null : 0.125 * (ordinal + 1),
      astAffinity: 0.75,
      graphAuthority: 0.5,
      personalizedPageRank: ordinal === 2 ? 0.03125 : null,
      communityAffinity: 0.25,
      manifold4OrientationSimilarity: 0.125,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: 0.625,
      executionUtility: 0.875,
      memoryUtility: ordinal === 2 ? 0 : 0.375,
      laneMask,
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: candidate.evidenceRefs,
    };
  });

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows,
    featureRevision,
    producerRevision: PRODUCER_REVISION,
  });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: PRODUCER_REVISION });
  const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 32, producerRevision: PRODUCER_REVISION });
  const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [2, 0], producerRevision: PRODUCER_REVISION });
  return { columnar, pack, gather };
}

async function main() {
  const fixture = buildFixture();
  if (fixture.pack.logicalRows !== 3 || fixture.pack.physicalRows !== 32 || fixture.pack.paddingRows !== 29) {
    throw new Error(`GPU_PARITY_PHYSICAL_SHAPE_MISMATCH:${fixture.pack.logicalRows}:${fixture.pack.physicalRows}:${fixture.pack.paddingRows}`);
  }

  const temp = await mkdtemp(join(tmpdir(), 'atlas-candidate-gpu-parity-'));
  const inputPath = join(temp, 'input.json');
  try {
    await writeFile(inputPath, JSON.stringify(fixture), 'utf8');
    const python = process.env.PYTHON ?? 'python';
    const proofScript = resolve(process.cwd(), '..', 'scripts', 'atlas', 'prove-candidate-feature-gpu-parity.py');
    const run = spawnSync(python, [proofScript, '--input', inputPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });

    const stdout = String(run.stdout ?? '').trim();
    const stderr = String(run.stderr ?? '').trim();
    if (run.status !== 0) {
      let observation: unknown = null;
      try { observation = JSON.parse(stdout); } catch { observation = stdout || null; }
      console.log(JSON.stringify({
        schema: 'atlas.candidate-feature-gpu-parity-bounded-proof.v1',
        status: 'GPU_PARITY_BLOCKED',
        pythonExitCode: run.status,
        cudaObservation: observation,
        stderr: stderr || null,
        storeWritesAttempted: false,
        canonicalWritesAttempted: false,
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const observation = JSON.parse(stdout) as CudaObservation;
    if (observation.schema !== 'atlas.candidate-feature-gpu-cuda-proof.v1') throw new Error(`GPU_PARITY_CUDA_SCHEMA_MISMATCH:${observation.schema}`);
    if (observation.status !== 'CANDIDATE_FEATURE_GPU_PARITY_PROVEN' || observation.gpuExecutionObserved !== true) {
      throw new Error(`GPU_PARITY_CUDA_OBSERVATION_NOT_PROVEN:${observation.status}`);
    }
    if (observation.challenger !== 'PYTORCH_CUDA') throw new Error(`GPU_PARITY_CUDA_CHALLENGER_MISMATCH:${observation.challenger}`);
    if (!observation.observed) throw new Error('GPU_PARITY_CUDA_OBSERVED_BUFFERS_MISSING');
    if (observation.columnarChecksum !== fixture.columnar.columnarChecksum) throw new Error('GPU_PARITY_CUDA_COLUMNAR_CHECKSUM_MISMATCH');
    if (observation.gpuPackChecksum !== fixture.pack.gpuPackChecksum) throw new Error('GPU_PARITY_CUDA_PACK_CHECKSUM_MISMATCH');
    if (observation.gatherChecksum !== fixture.gather.gatherChecksum) throw new Error('GPU_PARITY_CUDA_GATHER_CHECKSUM_MISMATCH');
    if (JSON.stringify(observation.observed.laneMaskU16) !== JSON.stringify(fixture.gather.laneMaskU16)) {
      throw new Error('GPU_PARITY_CUDA_LANE_MASK_MISMATCH');
    }
    if (JSON.stringify(observation.observed.degradedIdentity) !== JSON.stringify(fixture.gather.degradedIdentity)) {
      throw new Error('GPU_PARITY_CUDA_DEGRADED_IDENTITY_MISMATCH');
    }

    const receipt = verifyCandidateFeatureGpuParity({
      columnar: fixture.columnar,
      pack: fixture.pack,
      gather: fixture.gather,
      challenger: 'PYTORCH_CUDA',
      gpuExecutionObserved: true,
      observedSelectedOrdinals: observation.observed.selectedOrdinals,
      observedFeatureValues: observation.observed.featureValues,
      observedFeaturePresence: observation.observed.featurePresence,
      producerRevision: PRODUCER_REVISION,
    });

    console.log(JSON.stringify({
      schema: 'atlas.candidate-feature-gpu-parity-bounded-proof.v1',
      status: 'CANDIDATE_FEATURE_GPU_PARITY_BOUNDED_PROVEN',
      cudaObservation: {
        status: observation.status,
        torchVersion: observation.torchVersion ?? null,
        cudaVersion: observation.cudaVersion ?? null,
        deviceName: observation.deviceName ?? null,
        maxAbsFeatureDelta: observation.maxAbsFeatureDelta ?? null,
      },
      receipt,
      gates: {
        FEAT_03D_PHYSICAL_PADDING_VALID_MASK: true,
        FEAT_03D_REAL_ORDINAL_GATHER: true,
        FEAT_04_PYTORCH_CUDA_EXECUTION_OBSERVED: receipt.gpuExecutionObserved,
        FEAT_04_ORDINAL_PARITY: receipt.ordinalParity,
        FEAT_04_FEATURE_VALUE_PARITY: receipt.featureValueParity,
        FEAT_04_FEATURE_PRESENCE_PARITY: receipt.featurePresenceParity,
        FEAT_04_LANE_MASK_PARITY: receipt.laneMaskParity,
        FEAT_04_DEGRADED_IDENTITY_PARITY: receipt.degradedIdentityParity,
        FEAT_04_PADDING_MASK_PARITY: receipt.paddingMaskParity,
        FEAT_04_PADDING_ZERO_PARITY: receipt.paddingZeroParity,
      },
      safety: {
        storeWritesAttempted: false,
        canonicalWritesAttempted: false,
        qdrantWritesAttempted: false,
        postgresWritesAttempted: false,
        valkeyWritesAttempted: false,
        neo4jWritesAttempted: false,
      },
    }, null, 2));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
