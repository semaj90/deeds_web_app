import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  prepareUnifiedResidencyAceBridgeV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/tensors/unified-residency-ace-bridge-v1.js';
import {
  buildAceContextManifestAdmissionV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.js';
import {
  BitFrostTokenFsmManagerV1,
  buildBitFrostProceduralKeyV1,
  buildBitFrostProceduralDescriptorV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-token-fsm-v1.js';

test('ACE JSON Packet & GPU Cache Tile Synthesis Integration', async () => {
  // 1. Construct verified candidate snapshot
  const row0 = {
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: 'pkt_00000000000000000000000000000001',
    packetKey: 'packet_0',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'ws_rev_001',
    sourceRevision: 'sha256:' + '1'.repeat(64),
    graphRevision: null,
    semanticRevision: 'sem_rev_001',
    featureRevision: 'feat_rev_001',
    representationBindings: [],
    semanticRelevance: 0.95,
    lexicalRelevance: 0.88,
    astAffinity: 0.75,
    graphAuthority: 0.82,
    personalizedPageRank: 0.65,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: 0.8,
    memoryUtility: 0.7,
    laneMask: ['semantic', 'lexical'],
    degradedIdentity: false,
    evidenceRefs: ['evidence:0'],
  };

  const row1 = {
    ...row0,
    candidateOrdinal: 1,
    canonicalId: 'pkt_00000000000000000000000000000002',
    packetKey: 'packet_1',
    sourceRevision: 'sha256:' + '2'.repeat(64),
    semanticRelevance: 0.85,
    evidenceRefs: ['evidence:1'],
  };

  const snapshot = {
    schema: 'atlas.candidate-feature-snapshot.v1',
    candidateSnapshotRevision: 'snap_rev_001',
    ordinalMapChecksum: 'a'.repeat(64),
    workspaceRevision: 'ws_rev_001',
    featureRevision: 'feat_rev_001',
    rowCount: 2,
    rows: [row0, row1],
    snapshotChecksum: 'b'.repeat(64),
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: 'prod_rev_001',
  };

  // 2. Build ACE ContextManifest Admission
  const admission = buildAceContextManifestAdmissionV1({
    snapshot,
    requestId: 'req_001',
    selectedOrdinals: [0, 1],
    tokenBudget: 1024,
    retrievalPolicyRevision: 'retrieval_policy_v1',
    acePlaybookRevision: 'playbook_v1',
    representationRevision: 'semantic_768_v1',
    graphRevision: null,
  });

  assert.equal(admission.canonicalAuthority, false);
  assert.equal(admission.manifest.v1.candidateCount, 2);

  // 3. Derive GPU Tile Cache Descriptors via prepareUnifiedResidencyAceBridgeV1
  const bridgeResult = prepareUnifiedResidencyAceBridgeV1({
    snapshot,
    admission,
    domain: 'legal_contracts',
    lutRevision: 'lut_rev_001',
    lut: {
      legal_contracts: {
        lutRevision: 'lut_rev_001',
        tokenBudget: 1024,
        featureMask: ['semantic'],
        tileWidth: 768,
        contextWindow: 4096,
        residencyPriority: 1,
      },
    },
    representationRevision: 'semantic_768_v1',
    modelRevision: 'ornith-1.5-9b',
    tokenizerRevision: 'ornith-1.5:tokenizer:v1',
    ropeRevision: 'ornith-1.5:rope:v1',
  });

  assert.equal(bridgeResult.canonicalAuthority, false);
  assert.equal(bridgeResult.writesPerformed, false);
  assert.equal(bridgeResult.descriptors.length, 2);
  assert.equal(bridgeResult.descriptors[0].state, 'EMPTY');
  assert.equal(bridgeResult.descriptors[0].shape[1], 768);
  assert.equal(bridgeResult.descriptors[0].byteLength, 768 * 4); // float32

  // 4. Async/await concurrent parameter fetching: Load feature slices, CandidateOrdinal mappings, and typed adjacency in parallel
  const [featureSlices, ordinalMappings, typedAdjacency] = await Promise.all([
    // Feature slice mock fetch (emulating Arrow/TypedArray buffer)
    (async () => {
      const buffer = new Float32Array(768 * 2);
      buffer.fill(0.42);
      return { buffer, checksum: createHash('sha256').update(Buffer.from(buffer.buffer)).digest('hex') };
    })(),
    // CandidateOrdinal mapping fetch
    (async () => {
      return new Map([
        [0, { canonicalId: row0.canonicalId, ordinal: 0 }],
        [1, { canonicalId: row1.canonicalId, ordinal: 1 }],
      ]);
    })(),
    // Typed adjacency fetch
    (async () => {
      return [
        { fromOrdinal: 0, toOrdinal: 1, relation: 'REFERENCES', weight: 0.9 },
      ];
    })(),
  ]);

  assert.equal(ordinalMappings.size, 2);
  assert.equal(typedAdjacency.length, 1);
  assert.equal(featureSlices.buffer.length, 1536);

  // 5. Enforce BitFrost Token FSM Slot Transitions and Procedural Cache Keying
  const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1024 });

  // Verify procedural cache key: (model_name, artifact_checksum, representation_revision)
  const proceduralKey = buildBitFrostProceduralKeyV1({
    modelName: 'ornith-1.5-9b',
    artifactChecksum: snapshot.snapshotChecksum,
    representationRevision: 'semantic_768_v1',
  });
  assert.equal(
    proceduralKey,
    `bitfrost:procedural:ornith-1.5-9b:${snapshot.snapshotChecksum}:semantic_768_v1`
  );

  const descriptor = buildBitFrostProceduralDescriptorV1({
    modelName: 'ornith-1.5-9b',
    artifactChecksum: snapshot.snapshotChecksum,
    representationRevision: 'semantic_768_v1',
  });
  assert.equal(descriptor.kvCachePersisted, false);
  assert.equal(descriptor.hiddenThoughtsPersisted, false);
  assert.equal(descriptor.rawTensorPersisted, false);

  // Register and admit candidates through FSM
  fsm.registerUnloaded({
    candidateOrdinal: 0,
    packetKey: row0.packetKey,
    sourceRef: 'src/lib/server/test0.ts',
    sourceRevision: row0.sourceRevision,
    tokenCount: 256,
  });
  fsm.registerUnloaded({
    candidateOrdinal: 1,
    packetKey: row1.packetKey,
    sourceRef: 'src/lib/server/test1.ts',
    sourceRevision: row1.sourceRevision,
    tokenCount: 256,
  });

  fsm.admitCandidate({
    candidateOrdinal: 0,
    sourceRevision: row0.sourceRevision,
    expectedRevision: row0.sourceRevision,
  });
  fsm.admitCandidate({
    candidateOrdinal: 1,
    sourceRevision: row1.sourceRevision,
    expectedRevision: row1.sourceRevision,
  });

  fsm.promoteToResident({
    candidateOrdinal: 0,
    currentSourceRevision: row0.sourceRevision,
  });
  fsm.promoteToResident({
    candidateOrdinal: 1,
    currentSourceRevision: row1.sourceRevision,
  });

  assert.equal(fsm.getResidentTokens(), 512);
  assert.equal(fsm.getSlot(0)?.state, 'RESIDENT');
  assert.equal(fsm.getSlot(1)?.state, 'RESIDENT');
});
