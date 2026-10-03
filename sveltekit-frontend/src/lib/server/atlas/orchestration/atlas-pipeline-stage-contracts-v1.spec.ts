import { describe, expect, it } from 'vitest';
import { buildAceAdmissionV1, buildBlockedBitFrostResidencyPlanV1, buildBlockedPacketFabricCanaryV1, buildBlockedSemanticCohortAdmissionV1, buildCandidateOrdinalAdmissionV1, buildCandidateOrdinalMapAdmissionV1, buildPacketSummaryV1, candidateFeatureCellV1Schema, candidateFeatureMatrixV1Schema, candidateOrdinalMapAdmissionV1Schema, domainClassificationEvidenceV1Schema, graphOrdinalManifestV1Schema, graphSnapshotV1Schema, offlineTransportArtifactV1Schema, packetAdmissionCandidateV1Schema, packetFabricCanaryV1Schema, packetSummaryV1Schema, parsePacketSummaryV1, planPacketFabricCanaryV1, qloraTrainingSnapshotV1Schema, resolveFeaturePolicyLutEntryV1, selectSemanticExecutorV1, topologyCoordinate4V1Schema } from './atlas-pipeline-stage-contracts-v1.js';

describe('Atlas pipeline stage contracts', () => {
  it('blocks ordinal admission without a revision-qualified cohort', () => {
    const result = buildCandidateOrdinalAdmissionV1({ cohort: null, producerRevision: 'test:1' });
    expect(result.status).toBe('BLOCKED_LINEAGE');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(buildCandidateOrdinalMapAdmissionV1({ cohort: null, producerRevision: 'test:1' })).toBeNull();
  });

  it('rejects incomplete graph and feature manifests', () => {
    expect(() => graphSnapshotV1Schema.parse({ schema: 'atlas.graph-snapshot.v1' })).toThrow();
    expect(() => graphOrdinalManifestV1Schema.parse({ schema: 'atlas.graph-ordinal-manifest.v1' })).toThrow();
    expect(() => candidateFeatureMatrixV1Schema.parse({ schema: 'atlas.candidate-feature-matrix.v1' })).toThrow();
  });

  it('selects one semantic executor without creating extra lane votes', () => {
    expect(selectSemanticExecutorV1({ candidateCount: 5, exactCandidateLimit: 16, available: ['POSTGRES_EXACT', 'QDRANT_HNSW'] })).toBe('POSTGRES_EXACT');
    expect(selectSemanticExecutorV1({ candidateCount: 100, exactCandidateLimit: 16, available: ['POSTGRES_EXACT', 'QDRANT_HNSW'] })).toBe('QDRANT_HNSW');
    expect(selectSemanticExecutorV1({ candidateCount: 100, exactCandidateLimit: 16, available: ['POSTGRES_EXACT'] })).toBeNull();
    expect(() => buildBlockedSemanticCohortAdmissionV1({ status: 'BLOCKED_LINEAGE' })).toThrow('SEMANTIC_COHORT_UNAVAILABLE');
  });

  it('rejects duplicate ordinal and unavailable feature cells without reasons', () => {
    expect(() => candidateOrdinalMapAdmissionV1Schema.parse({
      schema: 'atlas.candidate-ordinal-map.v1', workspaceRevision: 'w:1',
      sourceRevisionSetChecksum: 'sha256:' + 'a'.repeat(64), candidateSetChecksum: 'sha256:' + 'b'.repeat(64),
      ordinalMapChecksum: 'sha256:' + 'c'.repeat(64), canonicalAuthority: false, writesPerformed: false,
      bindings: [
        { ordinal: 0, canonicalId: 'a', packetKey: 'p:a', symbolVersionId: null, sourceRef: 'a.ts', sourceRevision: 's:1', workspaceRevision: 'w:1' },
        { ordinal: 0, canonicalId: 'b', packetKey: 'p:b', symbolVersionId: null, sourceRef: 'b.ts', sourceRevision: 's:1', workspaceRevision: 'w:1' },
      ],
    })).toThrow('DUPLICATE_ORDINAL');
    expect(() => candidateFeatureCellV1Schema.parse({ value: null, available: false, reason: null })).toThrow('UNAVAILABLE_FEATURE_REASON_REQUIRED');
  });

  it('keeps ACE and BitFrost non-authoritative when identity is unavailable', () => {
    const ace = buildAceAdmissionV1({ identity: null, utilityScore: null, decision: 'ADMIT', policyRevision: 'test:1' });
    const residency = buildBlockedBitFrostResidencyPlanV1({ policyRevision: 'test:1' });
    expect(ace.decision).toBe('REJECT');
    expect(residency.canonicalAuthority).toBe(false);
    expect(residency.writesPerformed).toBe(false);
  });

  it('keeps classifier, LUT, and NES canary outputs fail-closed', () => {
    expect(() => domainClassificationEvidenceV1Schema.parse({ predictedDomain: 'NES', confidence: 1, classifierFamily: 'LOGISTIC_REGRESSION', classifierRevision: 'c:1', featureRevision: 'f:1', checkpointChecksum: 'sha256:' + 'a'.repeat(64), evidenceChecksum: 'sha256:' + 'b'.repeat(64), packetKey: 'p:1', sourceRef: 'x', workspaceRevision: 'w:1', sourceRevision: 's:1', contentDigest: 'sha256:' + 'c'.repeat(64), schema: 'atlas.domain-classification-evidence.v1', canonicalAuthority: true, writesPerformed: false })).toThrow();
    expect(resolveFeaturePolicyLutEntryV1({ entries: [], domain: 'NES', expectedRevision: 'lut:1' })).toBeNull();
    const canary = buildBlockedPacketFabricCanaryV1({ inputChecksum: 'sha256:' + 'd'.repeat(64) });
    expect(canary.status).toBe('BLOCKED_LINEAGE');
    expect(canary.writesPerformed).toBe(false);
  });

  it('rejects ambiguous LUT policy and keeps downstream artifacts non-authoritative', () => {
    const entry = {
      domain: 'NES', policyRevision: 'lut:1', tokenBudget: 256,
      featureMask: ['lexical'] as string[], tileWidth: 32,
      contextWindow: 512, residencyPriority: 'WARM' as const,
    };
    expect(resolveFeaturePolicyLutEntryV1({ entries: [entry, entry], domain: 'NES', expectedRevision: 'lut:1' })).toBeNull();
    expect(qloraTrainingSnapshotV1Schema.parse({
      schema: 'atlas.qlora-training-snapshot.v1', cohortChecksum: 'sha256:' + 'e'.repeat(64),
      workspaceRevision: 'workspace:1', packetCount: 45, featureRevision: 'feature:1',
      labelRevision: 'label:1', adapterRevision: null,
      trainingManifestChecksum: 'sha256:' + 'f'.repeat(64), status: 'BLOCKED_COHORT',
      canonicalAuthority: false, writesPerformed: false,
    }).canonicalAuthority).toBe(false);
  });

  it('validates derived topology and subordinate transport without promoting either', () => {
    const topology = topologyCoordinate4V1Schema.parse({
      schema: 'atlas.topology-coordinate4.v1', workspaceRevision: 'workspace:1',
      graphRevision: 'graph:1', canonicalId: 'candidate:1', coordinate: [0.1, 0.2, 0.3, 0.4],
      routeSignature: null, communityId: null, evidenceRefs: [], canonicalAuthority: false,
    });
    expect(topology.canonicalAuthority).toBe(false);
    const transport = offlineTransportArtifactV1Schema.parse({
      schema: 'atlas.offline-transport-artifact.v1', format: 'ARROW', sourceRevision: 'source:1',
      artifactChecksum: 'sha256:' + '1'.repeat(64), rowCount: 45, authority: 'POSTGRES',
      purpose: 'ANALYTICAL_JOIN', writesPerformed: false,
    });
    expect(transport.writesPerformed).toBe(false);
    const canary = packetFabricCanaryV1Schema.parse({
      schema: 'atlas.packet-fabric-canary.v1', corpus: 'NES_CHROM97',
      inputChecksum: 'sha256:' + '2'.repeat(64), requestedRows: 45,
      status: 'BLOCKED_LINEAGE', postgresReadback: 'REQUIRED',
      semanticProjectionReadback: 'NOT_RUN', qdrantProjectionReadback: 'NOT_RUN',
      aceResidencyReadback: 'NOT_RUN',
      canonicalAuthority: false, writesPerformed: false,
    });
    expect(canary.postgresReadback).toBe('REQUIRED');
  });

  it('requires packet admission and summary lineage before readback', () => {
    const checksum = 'sha256:' + '3'.repeat(64);
    const candidate = packetAdmissionCandidateV1Schema.parse({
      schema: 'atlas.packet-admission-candidate.v1', canonicalId: 'nes:1', packetKey: 'nes:1',
      workspaceRevision: 'workspace:1', sourceRef: 'nes/1.json', sourceRevision: 'source:1',
      sourcePayloadChecksum: checksum, producer: 'neschrom97', producerRevision: 'producer:1',
      admissionStatus: 'PENDING_LINEAGE', canonicalAuthority: false, writesPerformed: false,
    });
    expect(candidate.canonicalAuthority).toBe(false);
    const summary = buildPacketSummaryV1({ ...candidate,
      schema: 'atlas.packet-summary.v1', packetRevision: 'packet:1', representationRevision: null,
      domain: 'NES', kind: 'SPRITE', title: 'packet', summary: 'summary', lexicalText: 'text',
      semanticText: 'text', evidenceRefs: ['source:nes/1.json'],
      admissionStatus: 'READY_FOR_READBACK',
    });
    expect(parsePacketSummaryV1(summary).summaryChecksum).toBe(summary.summaryChecksum);
    expect(() => parsePacketSummaryV1({ ...summary, summary: 'tampered' })).toThrow('PACKET_SUMMARY_CHECKSUM_MISMATCH');
    expect(() => packetSummaryV1Schema.parse({ ...summary, summaryChecksum: checksum })).not.toThrow();
    expect(() => packetAdmissionCandidateV1Schema.parse({ ...candidate, sourceRevision: null })).toThrow();
  });

  it('preflights a complete packet canary without admitting or fanning out', () => {
    const checksum = 'sha256:' + '4'.repeat(64);
    const summary = buildPacketSummaryV1({
      schema: 'atlas.packet-summary.v1', canonicalId: 'nes:canary:1', packetKey: 'nes:canary:1',
      workspaceRevision: 'workspace:1', sourceRef: 'nes/1.json', sourceRevision: 'source:1',
      packetRevision: 'packet:1', representationRevision: null, domain: 'NES', kind: 'SPRITE',
      title: 'packet', summary: 'summary', lexicalText: 'text', semanticText: 'text',
      evidenceRefs: ['source:nes/1.json'], sourcePayloadChecksum: checksum, producer: 'neschrom97',
      producerRevision: 'producer:1', admissionStatus: 'READY_FOR_READBACK',
    });
    const plan = planPacketFabricCanaryV1({ summaries: [summary], inputChecksum: checksum, requestedRows: 1 });
    expect(plan.status).toBe('READY_FOR_BOUNDED_APPLY');
    expect(plan.postgresReadback).toBe('REQUIRED');
    expect(plan.canonicalAuthority).toBe(false);
    expect(plan.writesPerformed).toBe(false);
    expect(() => planPacketFabricCanaryV1({ summaries: [summary, summary], inputChecksum: checksum, requestedRows: 2 })).toThrow('DUPLICATE_CANONICAL_ID');
  });
});
