import { describe, expect, it } from 'vitest';
import { buildAceAdmissionV1, buildBlockedBitFrostResidencyPlanV1, buildBlockedPacketFabricCanaryV1, buildBlockedSemanticCohortAdmissionV1, buildCandidateFeatureCellsV1, buildCandidateFeatureMatrixArtifactV1, buildCandidateMatrixRowCrosswalkV1, buildCandidateOrdinalAdmissionV1, buildPacketSummaryV1, candidateFeatureCellV1Schema, candidateFeatureMatrixV1Schema, candidateFeatureMatrixRevisionV1, candidateFeatureSchemaChecksumV1, CANDIDATE_FEATURE_NAMES_V1, candidateMatrixRowCrosswalkV1Schema, candidateFeatureMatrixReceiptV1Schema, readbackCandidateFeatureMatrixArtifactV1, serializeCandidateFeatureMatrixArtifactV1, domainClassificationEvidenceV1Schema, graphOrdinalManifestV1Schema, graphSnapshotV1Schema, offlineTransportArtifactV1Schema, packetAdmissionCandidateV1Schema, packetFabricCanaryV1Schema, packetSummaryV1Schema, parsePacketSummaryV1, planPacketFabricCanaryV1, qloraTrainingSnapshotV1Schema, resolveFeaturePolicyLutEntryV1, selectSemanticExecutorV1, topologyCoordinate4V1Schema } from './atlas-pipeline-stage-contracts-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { assertCandidateOrdinalMapIntegrityV1, candidateOrdinalMapV1Schema, materializeCandidateOrdinalMap, materializeRevisionQualifiedSourceChunkOrdinalMapV1 } from '../features/canonical-candidate-v1.js';

describe('Atlas pipeline stage contracts', () => {
  it('blocks ordinal admission without a revision-qualified cohort', () => {
    const result = buildCandidateOrdinalAdmissionV1({ cohort: null, producerRevision: 'test:1' });
    expect(result.status).toBe('BLOCKED_LINEAGE');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(() => materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort: null, producerRevision: 'test:1' })).toThrow('CURRENT_SOURCE_CHUNK_COHORT_UNAVAILABLE');
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
    const ordinalMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'snapshot:test:1', workspaceRevision: 'w:1', producerRevision: 'test:1',
      candidates: [
        { canonicalId: 'a', packetKey: 'p:a', sourceRef: 'a.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision: 'w:1', sourceRevision: 's:1', graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
        { canonicalId: 'b', packetKey: 'p:b', sourceRef: 'b.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision: 'w:1', sourceRevision: 's:1', graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
      ],
    });
    expect(candidateOrdinalMapV1Schema.parse(ordinalMap)).toEqual(ordinalMap);
    expect(() => candidateOrdinalMapV1Schema.parse({
      schema: 'atlas.candidate-ordinal-map.v1', workspaceRevision: 'w:1', bindings: [],
      sourceRevisionSetChecksum: 'a'.repeat(64), candidateSetChecksum: 'b'.repeat(64), ordinalMapChecksum: 'c'.repeat(64),
      canonicalAuthority: false, writesPerformed: false,
    })).toThrow();
    expect(() => assertCandidateOrdinalMapIntegrityV1({
      ...ordinalMap,
      candidates: ordinalMap.candidates.map((candidate, index) => index === 1 ? { ...candidate, candidateOrdinal: 0 } : candidate),
    })).toThrow('CANDIDATE_ORDINAL_MAP_ORDINAL_SEQUENCE_BROKEN');
    const cellCoordinates = { candidateOrdinal: 0, rowOrdinal: 0, featureName: 'semantic_score' as const };
    expect(() => candidateFeatureCellV1Schema.parse({ ...cellCoordinates, value: null, available: false, reason: null })).toThrow('UNAVAILABLE_FEATURE_REASON_REQUIRED');
    expect(candidateFeatureCellV1Schema.parse({ ...cellCoordinates, value: 0, available: true, reason: null })).toEqual({ ...cellCoordinates, value: 0, available: true, reason: null });
    expect(() => candidateFeatureCellV1Schema.parse({ ...cellCoordinates, value: 0, available: false, reason: 'NO_EVIDENCE' })).toThrow('UNAVAILABLE_FEATURE_VALUE_MUST_BE_NULL');
    expect(() => candidateFeatureCellV1Schema.parse({ ...cellCoordinates, value: 0, available: true, reason: 'MEASURED_ZERO' })).toThrow('AVAILABLE_FEATURE_REASON_MUST_BE_NULL');
  });

  it('binds packet features to an ordered schema and represents unavailable lanes explicitly', () => {
    const names = [...CANDIDATE_FEATURE_NAMES_V1];
    const matrixBase = {
      schema: 'atlas.candidate-feature-matrix.v1', requestId: 'req:1', workspaceRevision: 'workspace:1',
      sourceRevisionSetChecksum: 'sha256:' + 'a'.repeat(64), representationRevision: null,
      representationRevisionUnavailableReason: 'NO_QUALIFIED_SEMANTIC_REPRESENTATION', featureRevision: 'feature:1',
      graphRevision: null, graphRevisionUnavailableReason: 'NO_QUALIFIED_STRUCTURAL_EDGE_COHORT',
      candidateSetChecksum: 'sha256:' + 'b'.repeat(64), candidateOrdinalMapChecksum: 'sha256:' + 'c'.repeat(64),
      rowBindingChecksum: 'sha256:' + 'e'.repeat(64),
      rows: 1, cols: names.length, featureNames: names, dtype: 'float32',
      featureSchemaChecksum: candidateFeatureSchemaChecksumV1(names), payloadChecksum: 'sha256:' + 'd'.repeat(64),
      availableFeatureMask: names.map((name) => name !== 'hyper_fact_hits'),
      missingFeatureReasons: { hyper_fact_hits: 'HYPERRAG_NOT_ADMITTED' },
      canonicalAuthority: false, writesPerformed: false,
    };
    const matrix = { ...matrixBase, matrixRevision: candidateFeatureMatrixRevisionV1(matrixBase) };

    expect(candidateFeatureMatrixV1Schema.parse(matrix).graphRevision).toBeNull();
    expect(() => candidateFeatureMatrixV1Schema.parse({ ...matrix, cols: names.length - 1 })).toThrow('FEATURE_COLUMN_COUNT_MISMATCH');
    const reorderedNames = [names[1], names[0], ...names.slice(2)];
    const reorderedMatrixBase = {
      ...matrixBase,
      featureNames: reorderedNames,
      featureSchemaChecksum: candidateFeatureSchemaChecksumV1(reorderedNames),
    };
    expect(() => candidateFeatureMatrixV1Schema.parse({
      ...reorderedMatrixBase,
      matrixRevision: candidateFeatureMatrixRevisionV1(reorderedMatrixBase),
    })).toThrow('FEATURE_ORDER_MISMATCH');
    expect(() => candidateFeatureMatrixV1Schema.parse({ ...matrix, featureSchemaChecksum: 'sha256:' + 'e'.repeat(64) })).toThrow('FEATURE_SCHEMA_CHECKSUM_MISMATCH');
    expect(() => candidateFeatureMatrixV1Schema.parse({ ...matrix, missingFeatureReasons: {} })).toThrow('UNAVAILABLE_FEATURE_REASON_REQUIRED');
    expect(() => candidateFeatureMatrixV1Schema.parse({ ...matrix, graphRevision: null, graphRevisionUnavailableReason: null })).toThrow('GRAPH_REVISION_REASON_MISMATCH');
    expect(() => candidateFeatureMatrixV1Schema.parse({ ...matrix, matrixRevision: 'sha256:' + 'f'.repeat(64) })).toThrow('MATRIX_REVISION_MISMATCH');
  });

  it('builds a deterministic matrix-row crosswalk from the admitted ordinal map only', () => {
    const candidateSnapshotRevision = 'snapshot:fixture:1';
    const sourceCandidates = materializeCandidateOrdinalMap({
      candidateSnapshotRevision,
      workspaceRevision: 'workspace:1',
      producerRevision: 'fixture-candidates:1',
      candidates: [
        { canonicalId: 'candidate:b', packetKey: 'packet:b', sourceRef: 'b.ts', treeNodeId: null, symbolVersionId: 'symbol:b@1', workspaceRevision: 'workspace:1', sourceRevision: 'source:b', graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
        { canonicalId: 'candidate:a', packetKey: 'packet:a', sourceRef: 'a.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision: 'workspace:1', sourceRevision: 'source:a', graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
      ],
    });
    const cohort = {
      status: 'REVISION_QUALIFIED' as const,
      workspaceRevision: 'workspace:1',
      candidateSnapshotRevision,
      sourceRevisionSetChecksum: 'sha256:' + 'a'.repeat(64),
      candidates: sourceCandidates.candidates,
    };
    const ordinalMap = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort, producerRevision: 'fixture-ordinal-map:1' });
    const crosswalk = buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [0, 1], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    });
    expect(crosswalk.bindings.map(({ candidateOrdinal, rowOrdinal, canonicalId }) => [candidateOrdinal, rowOrdinal, canonicalId])).toEqual([
      [0, 0, 'candidate:a'], [1, 1, 'candidate:b'],
    ]);
    expect(buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [0, 1], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    }).rowBindingChecksum).toBe(crosswalk.rowBindingChecksum);
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 1, matrixRowCandidateOrdinals: [0], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_ROW_COUNT_MISMATCH');
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [0, 1], matrixWorkspaceRevision: 'workspace:2',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_MATRIX_REVISION_MISMATCH');
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [1, 0], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_MATRIX_ROW_BINDING_MISMATCH');
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [0, 0], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_MATRIX_ROW_ORDINAL_DUPLICATE');
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap, matrixRowCount: 2, matrixRowCandidateOrdinals: [0], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_MATRIX_ROW_BINDING_COUNT_MISMATCH');
    const unresolvedPacketMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision, workspaceRevision: 'workspace:1', producerRevision: 'fixture-no-packet:1',
      candidates: [{ canonicalId: 'candidate:no-packet', packetKey: null, sourceRef: 'no-packet.ts', treeNodeId: null, symbolVersionId: 'symbol:no-packet@1', workspaceRevision: 'workspace:1', sourceRevision: 'source:no-packet', graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [] }],
    });
    expect(() => buildCandidateMatrixRowCrosswalkV1({
      ordinalMap: unresolvedPacketMap, matrixRowCount: 1, matrixRowCandidateOrdinals: [0], matrixWorkspaceRevision: 'workspace:1',
      matrixOrdinalMapChecksum: unresolvedPacketMap.ordinalMapChecksum,
    })).toThrow('CROSSWALK_PACKET_KEY_REQUIRED');
    expect(() => candidateMatrixRowCrosswalkV1Schema.parse({
      ...crosswalk,
      bindings: crosswalk.bindings.map((binding, index) => index === 1 ? { ...binding, rowOrdinal: 0 } : binding),
    })).toThrow('CROSSWALK_UNIQUE_ROW_ORDINAL');

    const unavailableReasons: Record<string, string> = {
      semantic_score: 'NO_QUALIFIED_SEMANTIC_REPRESENTATION',
      lexical_score: 'NO_QUALIFIED_LEXICAL_FEATURE',
      bfs_depth: 'NO_ADMITTED_STRUCTURAL_GRAPH',
      global_pagerank: 'NO_ADMITTED_STRUCTURAL_GRAPH',
      personalized_pagerank: 'NO_ADMITTED_STRUCTURAL_GRAPH',
      leiden_community: 'NO_ADMITTED_STRUCTURAL_GRAPH',
      domain_score: 'NO_QUALIFIED_DOMAIN_SIGNAL',
      error_signal: 'NO_QUALIFIED_ERROR_SIGNAL',
      smoke_signal: 'NO_VALIDATOR_RECEIPT',
      hyper_fact_hits: 'HYPERGRAPH_NOT_ADMITTED',
      relational_chain_score: 'HYPERGRAPH_NOT_ADMITTED',
    };
    const featureRows = [...crosswalk.bindings].reverse().map((binding) => ({
      candidateOrdinal: binding.candidateOrdinal,
      canonicalId: binding.canonicalId,
      packetKey: binding.packetKey,
      symbolVersionId: binding.symbolVersionId,
      workspaceRevision: binding.workspaceRevision,
      sourceRevision: binding.sourceRevision,
      features: Object.fromEntries(CANDIDATE_FEATURE_NAMES_V1.map((name) => [name, {
        value: null,
        available: false,
        reason: unavailableReasons[name],
      }])),
    }));
    const cells = buildCandidateFeatureCellsV1({ crosswalk, rows: featureRows });
    expect(cells[0]?.candidateOrdinal).toBe(0);
    expect(cells[11]?.candidateOrdinal).toBe(1);
    expect(() => buildCandidateFeatureCellsV1({ crosswalk, rows: [featureRows[0]!, featureRows[0]!] })).toThrow('FEATURE_ROW_DUPLICATE_CANDIDATE_ORDINAL');
    expect(() => buildCandidateFeatureCellsV1({
      crosswalk,
      rows: featureRows.map((row, index) => index === 0 ? { ...row, sourceRevision: 'source:wrong' } : row),
    })).toThrow('FEATURE_ROW_IDENTITY_REVISION_MISMATCH');
    const availableFeatureMask = CANDIDATE_FEATURE_NAMES_V1.map(() => false);
    const matrixBase = {
      schema: 'atlas.candidate-feature-matrix.v1', requestId: 'fixture:req:1', workspaceRevision: 'workspace:1',
      sourceRevisionSetChecksum: canonicalSha256V1(crosswalk.bindings.map(({ canonicalId, sourceRevision }) => ({ canonicalId, sourceRevision }))), representationRevision: null,
      representationRevisionUnavailableReason: 'NO_QUALIFIED_SEMANTIC_REPRESENTATION', featureRevision: 'feature:fixture:1',
      graphRevision: null, graphRevisionUnavailableReason: 'NO_ADMITTED_STRUCTURAL_GRAPH',
      candidateSetChecksum: canonicalSha256V1(ordinalMap.candidates.map((candidate) => candidate.canonicalId)), candidateOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
      rowBindingChecksum: crosswalk.rowBindingChecksum, rows: crosswalk.rowCount, cols: CANDIDATE_FEATURE_NAMES_V1.length,
      featureNames: [...CANDIDATE_FEATURE_NAMES_V1], dtype: 'float32' as const,
      featureSchemaChecksum: candidateFeatureSchemaChecksumV1(), payloadChecksum: canonicalSha256V1(cells),
      availableFeatureMask,
      missingFeatureReasons: unavailableReasons,
      canonicalAuthority: false as const, writesPerformed: false as const,
    };
    const matrix = candidateFeatureMatrixV1Schema.parse({ ...matrixBase, matrixRevision: candidateFeatureMatrixRevisionV1(matrixBase) });
    expect(matrix.sourceRevisionSetChecksum).toBe(canonicalSha256V1(crosswalk.bindings.map(({ canonicalId, sourceRevision }) => ({ canonicalId, sourceRevision }))));
    expect(matrix.availableFeatureMask.filter(Boolean)).toHaveLength(0);
    expect(cells.filter((cell) => !cell.available)).toHaveLength(22);
    const artifact = buildCandidateFeatureMatrixArtifactV1({ matrix, crosswalk, cells, producerRevision: 'fixture-producer:1' });
    expect(artifact.receipt.availableFeatureCount).toBe(0);
    expect(artifact.receipt.unavailableFeatureCount).toBe(11);
    expect(artifact.receipt.matrixChecksum).toBe(canonicalSha256V1({ matrix, crosswalk, cells }));
    const serialized = serializeCandidateFeatureMatrixArtifactV1(artifact);
    const readback = readbackCandidateFeatureMatrixArtifactV1(serialized);
    expect(readback).toEqual(artifact);
    expect(readback.receipt.matrixChecksum).toBe(artifact.receipt.matrixChecksum);
    expect(readback.crosswalk.bindings.map((binding) => binding.canonicalId)).toEqual(['candidate:a', 'candidate:b']);
    expect(readback.cells[0]).toEqual({
      candidateOrdinal: 0,
      rowOrdinal: 0,
      featureName: 'semantic_score',
      value: null,
      available: false,
      reason: 'NO_QUALIFIED_SEMANTIC_REPRESENTATION',
    });
    expect(() => buildCandidateFeatureMatrixArtifactV1({
      matrix,
      crosswalk,
      cells: cells.map((cell, index) => index === 0 ? { ...cell, candidateOrdinal: 1 } : cell),
      producerRevision: 'fixture-producer:1',
    })).toThrow('ARTIFACT_CELL_ROW_BINDING_MISMATCH');
    expect(() => buildCandidateFeatureMatrixArtifactV1({
      matrix,
      crosswalk,
      cells: cells.map((cell, index) => index === 0 ? { ...cell, featureName: 'lexical_score' } : cell),
      producerRevision: 'fixture-producer:1',
    })).toThrow('ARTIFACT_CELL_FEATURE_ORDER_MISMATCH');
    expect(() => buildCandidateFeatureMatrixArtifactV1({
      matrix, crosswalk, cells: cells.slice(1), producerRevision: 'fixture-producer:1',
    })).toThrow('MATRIX_RECEIPT_CELL_COUNT_MISMATCH');
    expect(() => readbackCandidateFeatureMatrixArtifactV1(serialized.replace(
      '"value":null,"available":false,"reason":"NO_QUALIFIED_SEMANTIC_REPRESENTATION"',
      '"value":null,"available":false,"reason":"CHANGED_REASON"',
    ))).toThrow('ARTIFACT_PAYLOAD_CHECKSUM_MISMATCH');
    expect(() => readbackCandidateFeatureMatrixArtifactV1(JSON.stringify({
      ...artifact,
      receipt: { ...artifact.receipt, candidateOrdinalMapRevision: 'sha256:' + '0'.repeat(64) },
    }))).toThrow('ARTIFACT_ORDINAL_MAP_REVISION_MISMATCH');
    expect(() => readbackCandidateFeatureMatrixArtifactV1(JSON.stringify({
      ...artifact,
      matrix: { ...artifact.matrix, sourceRevisionSetChecksum: '0'.repeat(64) },
    }))).toThrow('ARTIFACT_SOURCE_REVISION_SET_CHECKSUM_MISMATCH');
    expect(() => readbackCandidateFeatureMatrixArtifactV1(JSON.stringify({
      ...artifact,
      matrix: { ...artifact.matrix, availableFeatureMask: [true, ...artifact.matrix.availableFeatureMask.slice(1)] },
    }))).toThrow('AVAILABLE_FEATURE_HAS_NO_AVAILABLE_CELLS');
    const mismatchedCandidateSet = {
      ...matrix,
      candidateSetChecksum: canonicalSha256V1(['candidate:unbound']),
    };
    expect(() => buildCandidateFeatureMatrixArtifactV1({
      matrix: {
        ...mismatchedCandidateSet,
        matrixRevision: candidateFeatureMatrixRevisionV1(mismatchedCandidateSet),
      },
      crosswalk,
      cells,
      producerRevision: 'fixture-producer:1',
    })).toThrow('MATRIX_RECEIPT_CANDIDATE_SET_CHECKSUM_MISMATCH');
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
