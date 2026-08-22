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
import {
  buildCandidateFeatureGpuResidentLease,
  releaseCandidateFeatureGpuResidentLease,
  verifyCandidateFeatureGpuResidentLease,
} from '../../src/lib/server/atlas/features/candidate-feature-gpu-resident-lease-v1.js';

const PRODUCER = 'candidate-feature-gpu-resident-proof:2026-08-22:v1';
type Lane = 'semantic' | 'lexical' | 'ast' | 'graph' | 'manifold4' | 'cross_encoder' | 'domain' | 'execution' | 'memory';
type Kind = 'FEATURE_VALUES' | 'FEATURE_PRESENCE' | 'VALID_MASK' | 'LANE_MASK_U16' | 'DEGRADED_IDENTITY';

type RuntimeReceipt = {
  schema: 'atlas.candidate-feature-gpu-resident-runtime-proof.v1';
  status: 'CANDIDATE_FEATURE_GPU_RESIDENT_RUNTIME_PROVEN';
  leaseId: string;
  leaseEpoch: number;
  deviceId: number;
  deviceName: string;
  torchVersion: string;
  cudaVersion: string | null;
  stagingMode: 'PAGEABLE_SYNC' | 'PINNED_ASYNC';
  gpuPackChecksum: string;
  bufferIds: Record<Kind, string>;
  residentChecksums: Record<Kind, string>;
  observed: {
    selectedOrdinals: number[];
    featureValues: number[];
    featurePresence: number[];
    laneMaskU16: number[];
    degradedIdentity: number[];
    observedChecksum: string;
  };
  released: true;
  postReleaseAccessRejected: true;
  rawPointerExposed: false;
  cudaIpcExported: false;
  identityAuthority: false;
  canonicalWritesAttempted: false;
};

function buildFixture() {
  const candidateSnapshotRevision = 'candidate-snapshot:gpu-resident-proof:v1';
  const workspaceRevision = 'workspace:gpu-resident-proof:v1';
  const graphRevision = 'graph:gpu-resident-proof:v1';
  const semanticRevision = 'semantic:768:v1';
  const featureRevision = 'features:gpu-resident-proof:v1';

  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: PRODUCER,
    candidates: [
      { canonicalId: 'candidate:c', packetKey: 'packet:c', treeNodeId: 'tree:c', symbolVersionId: 'symbol:c', workspaceRevision, sourceRevision: 'source:c:v1', graphRevision, semanticRevision, degradedIdentity: false, evidenceRefs: ['e:c'] },
      { canonicalId: 'candidate:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a', workspaceRevision, sourceRevision: 'source:a:v1', graphRevision, semanticRevision, degradedIdentity: false, evidenceRefs: ['e:a'] },
      { canonicalId: 'candidate:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b', workspaceRevision, sourceRevision: 'source:b:v1', graphRevision, semanticRevision, degradedIdentity: true, evidenceRefs: ['e:b'] },
    ],
  });

  const rows = ordinalMap.candidates.map((candidate) => {
    const ordinal = candidate.candidateOrdinal;
    const laneMask: Lane[] = ['semantic', 'ast', 'graph', 'domain'];
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
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: 0.625,
      executionUtility: null,
      memoryUtility: ordinal === 2 ? 0 : 0.375,
      laneMask,
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: candidate.evidenceRefs,
    };
  });
  const snapshot = materializeCandidateFeatureSnapshot({ ordinalMap, rows, featureRevision, producerRevision: PRODUCER });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: PRODUCER });
  const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 32, producerRevision: PRODUCER });
  const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [2, 0], producerRevision: PRODUCER });
  return { pack, gather };
}

async function main() {
  const fixture = buildFixture();
  const stagingMode = process.env.ATLAS_GPU_STAGING_MODE === 'PINNED_ASYNC' ? 'PINNED_ASYNC' : 'PAGEABLE_SYNC';
  const temp = await mkdtemp(join(tmpdir(), 'atlas-gpu-resident-lease-'));
  const input = join(temp, 'input.json');
  try {
    await writeFile(input, JSON.stringify(fixture), 'utf8');
    const python = process.env.PYTHON ?? 'python';
    const proof = resolve(process.cwd(), '..', 'scripts', 'atlas', 'prove-candidate-feature-gpu-resident-lease.py');
    const run = spawnSync(python, [proof, '--input', input, '--staging-mode', stagingMode], {
      cwd: resolve(process.cwd(), '..'),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (run.status !== 0) {
      console.log(JSON.stringify({
        schema: 'atlas.candidate-feature-gpu-resident-bounded-proof.v1',
        status: 'GPU_RESIDENT_LEASE_BLOCKED',
        pythonExitCode: run.status,
        stdout: String(run.stdout ?? '').trim() || null,
        stderr: String(run.stderr ?? '').trim() || null,
        canonicalWritesAttempted: false,
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const runtime = JSON.parse(String(run.stdout).trim()) as RuntimeReceipt;
    if (runtime.status !== 'CANDIDATE_FEATURE_GPU_RESIDENT_RUNTIME_PROVEN') throw new Error(`GPU_RESIDENT_RUNTIME_NOT_PROVEN:${runtime.status}`);
    if (runtime.gpuPackChecksum !== fixture.pack.gpuPackChecksum) throw new Error('GPU_RESIDENT_PACK_CHECKSUM_MISMATCH');
    if (!runtime.released || !runtime.postReleaseAccessRejected) throw new Error('GPU_RESIDENT_RELEASE_PROOF_MISSING');
    if (runtime.rawPointerExposed || runtime.cudaIpcExported || runtime.identityAuthority) throw new Error('GPU_RESIDENT_OWNERSHIP_BOUNDARY_VIOLATION');

    const activeLease = buildCandidateFeatureGpuResidentLease({
      pack: fixture.pack,
      leaseId: runtime.leaseId,
      leaseEpoch: runtime.leaseEpoch,
      deviceId: runtime.deviceId,
      stagingMode: runtime.stagingMode,
      createdAt: '2026-08-22T03:00:00.000Z',
      expiresAt: '2026-08-22T03:10:00.000Z',
      bufferIds: runtime.bufferIds,
      residentChecksums: runtime.residentChecksums,
    });
    verifyCandidateFeatureGpuResidentLease({
      pack: fixture.pack,
      lease: activeLease,
      now: '2026-08-22T03:01:00.000Z',
    });

    if (JSON.stringify(runtime.observed.selectedOrdinals) !== JSON.stringify(fixture.gather.selectedOrdinals)) throw new Error('GPU_RESIDENT_ORDINAL_PARITY_MISMATCH');
    if (JSON.stringify(runtime.observed.featurePresence) !== JSON.stringify(fixture.gather.featurePresence)) throw new Error('GPU_RESIDENT_PRESENCE_PARITY_MISMATCH');
    if (JSON.stringify(runtime.observed.laneMaskU16) !== JSON.stringify(fixture.gather.laneMaskU16)) throw new Error('GPU_RESIDENT_LANE_PARITY_MISMATCH');
    if (JSON.stringify(runtime.observed.degradedIdentity) !== JSON.stringify(fixture.gather.degradedIdentity)) throw new Error('GPU_RESIDENT_DEGRADED_PARITY_MISMATCH');
    if (runtime.observed.featureValues.length !== fixture.gather.featureValues.length) throw new Error('GPU_RESIDENT_VALUE_COUNT_MISMATCH');
    for (let i = 0; i < fixture.gather.featureValues.length; i += 1) {
      if (Math.fround(runtime.observed.featureValues[i]!) !== Math.fround(fixture.gather.featureValues[i]!)) {
        throw new Error(`GPU_RESIDENT_VALUE_PARITY_MISMATCH:${i}`);
      }
    }

    const releasedLease = releaseCandidateFeatureGpuResidentLease({
      lease: activeLease,
      releasedAt: '2026-08-22T03:02:00.000Z',
    });
    let tsPostReleaseRejected = false;
    try {
      verifyCandidateFeatureGpuResidentLease({
        pack: fixture.pack,
        lease: releasedLease,
        now: '2026-08-22T03:03:00.000Z',
      });
    } catch (error) {
      tsPostReleaseRejected = error instanceof Error && error.message === 'FEATURE_GPU_LEASE_NOT_ACTIVE:RELEASED';
    }
    if (!tsPostReleaseRejected) throw new Error('GPU_RESIDENT_TS_POST_RELEASE_ACCESS_NOT_REJECTED');

    console.log(JSON.stringify({
      schema: 'atlas.candidate-feature-gpu-resident-bounded-proof.v1',
      status: 'CANDIDATE_FEATURE_GPU_RESIDENT_LEASE_BOUNDED_PROVEN',
      deviceName: runtime.deviceName,
      torchVersion: runtime.torchVersion,
      cudaVersion: runtime.cudaVersion,
      stagingMode: runtime.stagingMode,
      leaseEpoch: runtime.leaseEpoch,
      gpuPackChecksum: runtime.gpuPackChecksum,
      leaseChecksum: activeLease.leaseChecksum,
      residentChecksums: runtime.residentChecksums,
      gates: {
        sourceLineageVerified: true,
        residentPhysicalChecksumsVerified: true,
        opaqueBufferIdsOnly: true,
        gpuGatherParity: true,
        workerPostReleaseRejected: runtime.postReleaseAccessRejected,
        contractPostReleaseRejected: tsPostReleaseRejected,
        cudaIpcExported: false,
        rawPointerExposed: false,
      },
      safety: {
        canonicalWritesAttempted: false,
        postgresWritesAttempted: false,
        qdrantWritesAttempted: false,
        neo4jWritesAttempted: false,
        valkeyWritesAttempted: false,
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
