import { describe, expect, it } from 'vitest';
import {
  buildAtlasExecutionPipelineV1,
  assertAtlasExecutionPipelineIdentityReadyV1,
  ATLAS_PIPELINE_CONTRACT_BINDINGS_V1,
  validateAtlasDomainClassifierResponseV1,
} from './atlas-execution-pipeline-v1.js';

const sha = (value: string) => value.padStart(64, '0').slice(-64);
const stage = (stageId: any, executor: any, dependsOn: any[] = [], logicalLane = 'NONE', voteGroup = 'NONE') => ({
  stageId, executor, executorRevision: `${String(executor).toLowerCase()}:v1`, dependsOn,
  identity: { workspaceRevision: null, packetRevision: null, representationRevision: null },
  inputSchemaRevision: 'schema:v1', outputSchemaRevision: 'schema:v1',
  inputChecksum: null, outputChecksum: null,
  stream: { format: 'JSONL', ordering: 'SOURCE_ORDER', chunkBytes: 65536, maxBatchRows: 256, maxInFlight: 2 },
  logicalLane, voteGroup, canonicalAuthority: false,
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req:pipeline-1', pipelineRevision: 'atlas-execution-pipeline:v1',
    identity: {
      workspaceId: 'repo:root', workspaceRevision: 'sha256:' + sha('1'), snapshotRevision: 'sha256:' + sha('2'),
      canonicalExecutionId: '74d50c86-8194-45ea-8c3d-61aab737ef83', packetRevision: null, packetAdmissionReceiptChecksum: sha('3'), packetChunkClosureReceiptChecksum: sha('4'),
      representationRevision: 'semantic_768:r1', featureRevision: 'features:v1',
    },
    context: {
      contextManifestIdentityChecksum: null, candidateSnapshotRevision: 'snapshot:r1', candidateOrdinalMapChecksum: sha('5'),
      graphRevision: 'graph:r1', graphOrdinalMapChecksum: sha('6'), aceCacheIdentityChecksum: null,
    },
    event: { correlationId: '11111111-1111-4111-8111-111111111111', causationId: null, eventContractRevision: 'workflow:event:v1', occurredAt: '2026-09-16T12:00:00.000Z' },
    stages: [
      stage('DECODE_STREAM', 'SIMDJSON'),
      stage('PACKET_FEATURES', 'CPU_SIMD', ['DECODE_STREAM']),
      stage('DOMAIN_CLASSIFY', 'FASTAPI_LR', ['PACKET_FEATURES']),
      stage('CANDIDATE_SNAPSHOT', 'CPU_SCALAR', ['DOMAIN_CLASSIFY']),
      stage('GRAPH_DAG', 'NETWORKX', ['CANDIDATE_SNAPSHOT'], 'GRAPH', 'GRAPH'),
      stage('RETRIEVAL', 'QDRANT_EXACT', ['CANDIDATE_SNAPSHOT'], 'SEMANTIC', 'SEMANTIC'),
      stage('CACHE_RESIDENCY', 'BITFROST', ['RETRIEVAL']),
      stage('CONTEXT_ASSEMBLY', 'CPU_SCALAR', ['CACHE_RESIDENCY']),
    ],
    policy: { projectionIdsMayBecomeCanonical: false, executorMayCreatePacketIdentity: false, classifierMayCreatePacketIdentity: false, mutationRequiresAuthorizationReceipt: true, semanticLaneMaxVotes: 1 },
    writesPerformed: false,
    ...overrides,
  };
}

describe('AtlasExecutionPipelineV1', () => {
  it('builds deterministic identity for the complete orchestration DAG', () => {
    const first = buildAtlasExecutionPipelineV1(input());
    const second = buildAtlasExecutionPipelineV1(input());
    expect(first.pipelineChecksum).toBe(second.pipelineChecksum);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.contractBindings).toEqual(ATLAS_PIPELINE_CONTRACT_BINDINGS_V1);
    expect(first.contractBindings.every((binding) => binding.promotionEligible === false)).toBe(true);
  });

  it('changes checksum when canonical workspace revision changes', () => {
    const first = buildAtlasExecutionPipelineV1(input());
    const second = buildAtlasExecutionPipelineV1(input({ identity: { ...input().identity, workspaceRevision: 'sha256:' + sha('9') } }));
    expect(second.pipelineChecksum).not.toBe(first.pipelineChecksum);
  });

  it('does not change canonical identity when only the retrieval executor changes', () => {
    const first = buildAtlasExecutionPipelineV1(input());
    const second = buildAtlasExecutionPipelineV1(input({ stages: input().stages.map((value: any) => value.stageId === 'RETRIEVAL' ? { ...value, executor: 'TURBOVEC', executorRevision: 'turbovec:v2' } : value) }));
    expect(second.pipelineChecksum).not.toBe(first.pipelineChecksum);
    expect(second.identity).toEqual(first.identity);
  });

  it('rejects cycles, semantic vote inflation, and executor boundary violations', () => {
    expect(() => buildAtlasExecutionPipelineV1(input({ stages: [stage('DECODE_STREAM', 'SIMDJSON', ['PACKET_FEATURES']), stage('PACKET_FEATURES', 'CPU_SIMD', ['DECODE_STREAM'])] }))).toThrow('PIPELINE_STAGE_CYCLE');
    expect(() => buildAtlasExecutionPipelineV1(input({ stages: input().stages.map((value: any) => value.stageId === 'RETRIEVAL' ? { ...value, voteGroup: 'GRAPH' } : value) }))).toThrow('PIPELINE_LANE_VOTE_GROUP_MISMATCH');
    expect(() => buildAtlasExecutionPipelineV1(input({ stages: [stage('DOMAIN_CLASSIFY', 'NETWORKX')] }))).toThrow('PIPELINE_EXECUTOR_BOUNDARY');
  });

  it('rejects checksum chain mismatches', () => {
    const stages = input().stages.map((value: any) => value.stageId === 'DECODE_STREAM'
      ? { ...value, outputChecksum: sha('a') }
      : value.stageId === 'PACKET_FEATURES'
        ? { ...value, inputChecksum: sha('b') }
        : value);
    expect(() => buildAtlasExecutionPipelineV1(input({ stages }))).toThrow('PIPELINE_CHECKSUM_CHAIN_MISMATCH');
  });

  it('keeps planning DAGs valid but rejects executable DAGs with missing identity checksums', () => {
    const planned = buildAtlasExecutionPipelineV1(input());
    expect(() => assertAtlasExecutionPipelineIdentityReadyV1(planned)).toThrow('PIPELINE_STAGE_WORKSPACE_REVISION_REQUIRED:DECODE_STREAM');
  });

  it('accepts an executable checksum chain only when every stage is bound', () => {
    const outputs = new Map<string, string>();
    const stageIdentity = { workspaceRevision: 'sha256:' + sha('1'), packetRevision: 'sha256:' + sha('7'), representationRevision: 'semantic_768:r1' };
    const stages = input().stages.map((value: any, index: number) => {
      const outputChecksum = sha(String(index + 20));
      const inputChecksum = value.dependsOn.length ? outputs.get(value.dependsOn[0]) ?? null : null;
      outputs.set(value.stageId, outputChecksum);
      return { ...value, identity: stageIdentity, inputChecksum, outputChecksum };
    });
    const pipeline = buildAtlasExecutionPipelineV1(input({ identity: { ...input().identity, packetRevision: stageIdentity.packetRevision }, stages }));
    expect(() => assertAtlasExecutionPipelineIdentityReadyV1(pipeline)).not.toThrow();
  });

  it('requires workspace, packet, and representation revisions on every executable stage', () => {
    const outputs = new Map<string, string>();
    const stages = input().stages.map((value: any, index: number) => {
      const outputChecksum = sha(String(index + 40));
      const inputChecksum = value.dependsOn.length ? outputs.get(value.dependsOn[0]) ?? null : null;
      outputs.set(value.stageId, outputChecksum);
      return { ...value, inputChecksum, outputChecksum };
    });
    const pipeline = buildAtlasExecutionPipelineV1(input({ stages }));
    expect(() => assertAtlasExecutionPipelineIdentityReadyV1(pipeline)).toThrow('PIPELINE_STAGE_WORKSPACE_REVISION_REQUIRED:DECODE_STREAM');
  });

  it('rejects a stage whose revision identity diverges from the pipeline', () => {
    const outputs = new Map<string, string>();
    const identity = { workspaceRevision: 'sha256:' + sha('1'), packetRevision: 'sha256:' + sha('7'), representationRevision: 'semantic_768:r1' };
    const stages = input().stages.map((value: any, index: number) => {
      const outputChecksum = sha(String(index + 60));
      const inputChecksum = value.dependsOn.length ? outputs.get(value.dependsOn[0]) ?? null : null;
      outputs.set(value.stageId, outputChecksum);
      return { ...value, identity: value.stageId === 'RETRIEVAL' ? { ...identity, representationRevision: 'semantic_768:other' } : identity, inputChecksum, outputChecksum };
    });
    const pipeline = buildAtlasExecutionPipelineV1(input({ identity: { ...input().identity, packetRevision: identity.packetRevision }, stages }));
    expect(() => assertAtlasExecutionPipelineIdentityReadyV1(pipeline)).toThrow('PIPELINE_STAGE_REPRESENTATION_REVISION_MISMATCH:RETRIEVAL');
  });

  it('requires exactly one contract binding per runtime stage', () => {
    const bindings = input().stages.map((value: any) => ({
      stageId: value.stageId, contractSchema: `atlas.${String(value.stageId).toLowerCase()}.v1`, status: 'SCAFFOLD_CREATED', promotionEligible: false,
    }));
    expect(() => buildAtlasExecutionPipelineV1(input({ contractBindings: bindings.slice(1) }))).toThrow('PIPELINE_MISSING_CONTRACT_BINDING:DECODE_STREAM');
    expect(() => buildAtlasExecutionPipelineV1(input({ contractBindings: [...bindings, bindings[0]] }))).toThrow('PIPELINE_DUPLICATE_CONTRACT_BINDING:DECODE_STREAM');
  });

  it('requires FastAPI classifier response lineage to echo the request', () => {
    const request = {
      packetKey: 'packet:current-1', workspaceRevision: 'sha256:' + sha('1'), sourceRevision: 'sha256:' + sha('2'),
      contentDigest: sha('3'), featureRevision: 'features:v1', featureChecksum: sha('4'), classifierRevision: 'lr:v1', features: [0.1, 0.2],
    };
    const { features: _features, ...responseLineage } = request;
    const response = validateAtlasDomainClassifierResponseV1(request, {
      ...responseLineage, checkpointChecksum: sha('5'), predictedDomain: 'retrieval', confidence: 0.9, status: 'PREDICTED',
    });
    expect(response.packetKey).toBe(request.packetKey);
    expect(() => validateAtlasDomainClassifierResponseV1(request, {
      ...response, sourceRevision: 'sha256:' + sha('9'),
    })).toThrow('CLASSIFIER_PARAMETER_MISMATCH:sourceRevision');
  });
});
