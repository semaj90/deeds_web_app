import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATLAS_MEMORY_ROLE_REFERENCE_V1,
  atlasMemoryRoleV1Schema,
  buildAtlasAceNoveltySignalV1,
  buildLlamaRuntimeMemoryManifestV1,
} from '../dist/core/ace-runtime-memory-contracts-v1.js';

const sha = (c) => `sha256:${c.repeat(64)}`;

test('memory roles are descriptive and preserve owner boundaries', () => {
  assert.equal(atlasMemoryRoleV1Schema.parse('CANONICAL_PERSISTENCE'), 'CANONICAL_PERSISTENCE');
  assert.equal(ATLAS_MEMORY_ROLE_REFERENCE_V1.postgres, 'CANONICAL_PERSISTENCE');
  assert.equal(ATLAS_MEMORY_ROLE_REFERENCE_V1.bitfrost, 'CONTROL_RESIDENCY');
  assert.equal(ATLAS_MEMORY_ROLE_REFERENCE_V1.llama_mha_cache, 'MODEL_KV');
  assert.equal(ATLAS_MEMORY_ROLE_REFERENCE_V1.llama_recurrent_state, 'MODEL_RECURRENT_STATE');
  assert.equal(ATLAS_MEMORY_ROLE_REFERENCE_V1.tensorrt_rtx_runtime_cache, 'RUNTIME_COMPILE_CACHE');
  assert.notEqual(ATLAS_MEMORY_ROLE_REFERENCE_V1.bitfrost, ATLAS_MEMORY_ROLE_REFERENCE_V1.llama_mha_cache);
});

test('KV and recurrent state remain distinct layer roles', () => {
  const manifest = buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: 'ornith-1.5-9b@fixture',
    tokenizerRevision: 'tokenizer@fixture',
    contextManifestChecksum: sha('a'),
    promptPlanChecksum: sha('b'),
    layers: [
      { ordinal: 0, layerKind: 'RECURRENT', memoryRole: 'MODEL_RECURRENT_STATE', bytes: 1024, dtype: 'f16', quantizationPolicy: 'NONE' },
      { ordinal: 1, layerKind: 'MHA', memoryRole: 'MODEL_KV', bytes: 2048, dtype: 'f16', quantizationPolicy: 'q8_0' },
      { ordinal: 2, layerKind: 'MLP', memoryRole: 'NONE', dtype: 'f16', quantizationPolicy: 'NONE' },
    ],
    kvBytes: 2048,
    recurrentStateBytes: 1024,
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  });
  assert.equal(manifest.layers[0].memoryRole, 'MODEL_RECURRENT_STATE');
  assert.equal(manifest.layers[1].memoryRole, 'MODEL_KV');
  assert.equal(manifest.observationOnly, true);
  assert.equal(manifest.writesPerformed, false);
});

test('runtime memory manifest fails closed on missing required revisions', () => {
  assert.throws(() => buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: '',
    tokenizerRevision: 'tok-r1',
    contextManifestChecksum: sha('a'),
    layers: [{ ordinal: 0, layerKind: 'MHA', memoryRole: 'MODEL_KV', dtype: 'f16', quantizationPolicy: 'NONE' }],
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  }));
  assert.throws(() => buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: 'm1',
    tokenizerRevision: '',
    contextManifestChecksum: sha('a'),
    layers: [{ ordinal: 0, layerKind: 'MHA', memoryRole: 'MODEL_KV', dtype: 'f16', quantizationPolicy: 'NONE' }],
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  }));
});

test('manifest rejects role/layer mismatches and inconsistent aggregate bytes', () => {
  assert.throws(() => buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: 'm1',
    tokenizerRevision: 't1',
    contextManifestChecksum: sha('a'),
    layers: [{ ordinal: 0, layerKind: 'RECURRENT', memoryRole: 'MODEL_KV', bytes: 10, dtype: 'f16', quantizationPolicy: 'NONE' }],
    kvBytes: 10,
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  }));
  assert.throws(() => buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: 'm1',
    tokenizerRevision: 't1',
    contextManifestChecksum: sha('a'),
    layers: [{ ordinal: 0, layerKind: 'MHA', memoryRole: 'MODEL_KV', bytes: 10, dtype: 'f16', quantizationPolicy: 'NONE' }],
    kvBytes: 11,
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  }));
});

test('novelty signal is observation-only and cannot affect residency in V1', () => {
  const signal = buildAtlasAceNoveltySignalV1({
    schema: 'atlas.ace-novelty-signal.v1',
    candidateId: 'packet:1',
    candidateOrdinal: 7,
    semanticNovelty: 0.4,
    structuralNovelty: 0.2,
    domainTransition: 1,
    retrievalUtilityDelta: -0.1,
    evidenceRefs: ['receipt:fixture'],
    featureRevision: 'feature-r1',
    affectsResidency: false,
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
  });
  assert.equal(signal.affectsResidency, false);
  assert.throws(() => buildAtlasAceNoveltySignalV1({ ...signal, affectsResidency: true }));
});

test('contracts reject inline tensor/vector payloads', () => {
  assert.throws(() => buildLlamaRuntimeMemoryManifestV1({
    schema: 'atlas.llama-runtime-memory-manifest.v1',
    modelRevision: 'm1',
    tokenizerRevision: 't1',
    contextManifestChecksum: sha('a'),
    layers: [{ ordinal: 0, layerKind: 'MHA', memoryRole: 'MODEL_KV', dtype: 'f16', quantizationPolicy: 'NONE', tensor: [1, 2, 3] }],
    observedAt: '2026-09-27T19:00:00Z',
    observationOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    modelExecutionPerformed: false,
  }));
});
