import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  admitSearchRuntimeQasToAceManifestV1,
  createAtlasSearchAdapter,
  projectAtlasSearchResponseToQas,
} from './search-runtime-adapter.js';
import { loadUnifiedResidencyFeaturePackV1 } from '../tensors/unified-residency-feature-pack-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  buildCentroidArtifactV1,
  buildCentroidCardV1,
  buildCentroidManifestV1,
} from '../cache/centroid-artifact-v1.js';

const sourceText = 'export const one = 1;';
const sourceBytes = Buffer.from(sourceText, 'utf8');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;

function makeGroundedSourceBindingReceipt() {
  const payload = {
    schema: 'atlas.grounded-extraction-source-binding-receipt.v1' as const,
    status: 'VERIFIED_SOURCE_BINDING' as const,
    canonicalPacketKey: 'packet:one',
    storagePacketKey: 'packet:one',
    packetResolutionSource: 'V2_DIRECT' as const,
    sourceRef: 'src/one.ts',
    sourceRevision,
    workspaceRevision,
    sourceBindingChecksum: `sha256:${'b'.repeat(64)}`,
    submittedTextChecksum: sourceRevision,
    byteLength: sourceBytes.byteLength,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return {
    ...payload,
    checksum: `sha256:${createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')}`,
  };
}

function makeCentroidCandidateHint() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:search:r1',
    workspaceRevision,
    producerRevision: 'search-snapshot:r1',
    candidates: [{
      canonicalId: 'symbol:one',
      packetKey: 'packet:one',
      sourceRef: 'src/one.ts',
      treeNodeId: null,
      symbolVersionId: 'symbol-version:one',
      workspaceRevision,
      sourceRevision,
      graphRevision: 'graph:r1',
      semanticRevision: 'semantic_768:r1',
      degradedIdentity: false,
      evidenceRefs: ['src/one.ts'],
      representationBindings: [],
    }],
  });
  const artifact = buildCentroidArtifactV1({
    centroidId: 'centroid:one',
    workspaceRevision,
    representationRevision: 'semantic_768:r1',
    clusteringRevision: 'kmeans:r1',
    vector: [1, 0],
    memberIds: ['symbol:one'],
    artifactRef: 'fixture:centroid:one',
  });
  const manifest = buildCentroidManifestV1({
    workspaceRevision,
    candidateSnapshotRevision: 'snapshot:search:r1',
    representationRevision: 'semantic_768:r1',
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    clusteringPassId: 'pass:r1',
    algorithmRevision: 'kmeans:r1',
    parametersChecksum: 'd'.repeat(64),
    candidateCount: 1,
    centroids: [{
      centroidId: artifact.centroidId,
      artifactRef: artifact.artifactRef,
      artifactChecksum: artifact.checksum,
      memberCount: artifact.memberCount,
      memberSetChecksum: artifact.memberSetChecksum,
    }],
    memberAssignmentChecksum: 'e'.repeat(64),
  });
  const card = buildCentroidCardV1({
    centroidId: artifact.centroidId,
    clusteringPassId: manifest.clusteringPassId,
    workspaceRevision,
    candidateSnapshotRevision: 'snapshot:search:r1',
    representationRevision: 'semantic_768:r1',
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    candidateCount: 1,
    clusterSize: 1,
    exemplarOrdinals: [0],
    domainHints: ['code'],
    conceptHints: ['symbol'],
    centroidArtifactRef: artifact.artifactRef,
    centroidArtifactChecksum: artifact.checksum,
  });
  return { card, manifest };
}

describe('SearchRuntime QAS projection boundary', () => {
  it('rejects a stale centroid manifest without changing retrieval results', async () => {
    const response = {
      packets: [{
        chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
        symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
        workspace_revision: workspaceRevision, source_revision: sourceRevision,
        representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
      }],
      metadata: {} as any,
      provenance: {} as any,
    } as any;
    const adapter = createAtlasSearchAdapter({ runtime: { search: async () => response } });
    const centroidHint = makeCentroidCandidateHint();
    const baseline = await adapter.search({ query: 'inspect', topK: 1 });
    const result = await adapter.searchWithAceManifest({ query: 'inspect', topK: 1 }, {
      requestId: 'request:stale-centroid',
      policyRevision: 'policy:r1',
      workspaceRevision,
      representationRevision: 'semantic_768:r1',
      candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'ace-playbook:r1',
      tokenBudget: 1200,
      producerRevision: 'search-snapshot:r1',
      laneMaskByCanonicalId: { 'symbol:one': ['semantic'] },
      centroidCandidateHint: {
        ...centroidHint,
        manifest: { ...centroidHint.manifest, workspaceRevision: 'sha256:stale' },
      },
      sources: {
        projection: () => ({
          packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
          ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5,
          recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1', featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
          features: {
            semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
            processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
            reuseProbability: 0, recency: 0,
          },
        }),
      },
    });

    expect(result.centroidCandidateCrosswalk).toBeNull();
    expect(result.centroidCandidateCrosswalkRejection).toMatch(/CHECKSUM_MISMATCH|WORKSPACE_REVISION_MISMATCH/);
    expect(result.response.packets).toEqual(baseline.packets);
    expect(result.writesPerformed).toBe(false);
  });

  it('composes the opt-in caller from the canonical runtime response', async () => {
    const adapter = createAtlasSearchAdapter({
      runtime: {
        search: async () => ({
          packets: [{
            chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
            symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
            workspace_revision: workspaceRevision, source_revision: sourceRevision,
            representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
          }],
          metadata: {} as any,
          provenance: {} as any,
        } as any),
      },
    });
    expect(typeof adapter.search).toBe('function');
    expect(typeof adapter.searchWithQas).toBe('function');
    const result = await adapter.searchWithQas({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision,
      representationRevision: 'semantic_768:r1',
      sources: {
        projection: () => ({
          packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
          ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5,
          recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1', featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
          features: {
            semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
            processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
            reuseProbability: 0, recency: 0,
          },
        }),
      },
    });
    expect(result.response.packets).toHaveLength(1);
    expect(result.qas.accepted).toHaveLength(1);
    expect(result.qas.exactBaseline[0]?.canonicalId).toBe('symbol:one');

    const manifestResult = await adapter.searchWithAceManifest({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision,
      representationRevision: 'semantic_768:r1', candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'ace-playbook:r1', tokenBudget: 1200,
      producerRevision: 'search-snapshot:r1', laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      cachedPacketHints: [
        { hintId: 'valkey:source:one', kind: 'SOURCE_REF', sourceRef: 'src/one.ts' },
        { hintId: 'valkey:centroid:one', kind: 'CENTROID' },
      ],
      centroidCandidateHint: makeCentroidCandidateHint(),
      cachedPacketSourceEvidence: [{
        hintId: 'valkey:source:one',
        evidence: {
          canonicalId: 'symbol:one', packetKey: 'packet:one', sourceRef: 'src/one.ts',
          sourceRevision, workspaceRevision, evidenceRef: 'evidence:ace-one',
          extractorRevision: 'ast-grep:fixture-v1', startByte: 0, endByte: sourceBytes.byteLength,
          text: sourceText, sourceBytes,
        },
        sourceBindingReceipt: makeGroundedSourceBindingReceipt(),
      }],
      retrievalCacheModel: 'embeddinggemma', retrievalCacheDim: 768, contextPolicyRevision: 'context:r1',
      sources: {
        projection: () => ({
          packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
          ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5,
          recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1', featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
          features: { semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
            processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
            reuseProbability: 0, recency: 0 },
        }),
      },
    });
    expect(manifestResult.admission.manifest.v1.snapshotId).toBe('snapshot:search:r1');
    expect(manifestResult.snapshot.rowCount).toBe(1);
    expect(manifestResult.snapshot.rows[0]?.canonicalId).toBe('symbol:one');
    expect(manifestResult.snapshot.identityAuthority).toBe(false);
    expect(manifestResult.writesPerformed).toBe(false);
    expect(manifestResult.candidateFeatureMatrixArtifact.matrix.rows).toBe(1);
    expect(manifestResult.candidateFeatureMatrixArtifact.crosswalk.bindings[0]).toMatchObject({
      candidateOrdinal: 0,
      rowOrdinal: 0,
      canonicalId: 'symbol:one',
      packetKey: 'packet:one',
      workspaceRevision,
    });
    expect(manifestResult.candidateFeatureMatrixArtifact.cells).toHaveLength(11);
    expect(manifestResult.candidateFeatureMatrixArtifact.cells.find((cell) => cell.featureName === 'semantic_score')).toMatchObject({
      value: null, available: false, reason: 'SEMANTIC_COHORT_ADMISSION_NOT_SUPPLIED',
    });
    expect(manifestResult.candidateFeatureMatrixArtifact.cells.find((cell) => cell.featureName === 'global_pagerank')).toMatchObject({
      value: null, available: false, reason: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    });
    expect(manifestResult.candidateFeatureMatrixArtifact.receipt.matrixChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestResult.cachedPacketCandidateResolution).toMatchObject({
      status: 'RESOLVED_HINTS',
      matches: [{ canonicalId: 'symbol:one', packetKey: 'packet:one', sourceRef: 'src/one.ts' }],
      rejections: [{ hintId: 'valkey:centroid:one', reason: 'CENTROID_HINT_NOT_EVIDENCE' }],
      evidenceStatus: 'UNVERIFIED',
      canonicalAuthority: false,
    });
    expect(manifestResult.centroidCandidateCrosswalk).toMatchObject({
      status: 'CANDIDATE_HINTS_ONLY',
      evidenceStatus: 'UNVERIFIED',
      candidates: [{ candidateOrdinal: 0, canonicalId: 'symbol:one', packetKey: 'packet:one', sourceRef: 'src/one.ts' }],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(manifestResult.centroidCandidateCrosswalkRejection).toBeNull();
    expect(manifestResult.response.packets).toEqual(result.response.packets);
    expect(manifestResult.cachedPacketSourceSpanVerifications).toMatchObject([{
      status: 'SOURCE_SPAN_VERIFIED_NOT_ADMITTED',
      evidenceRef: 'evidence:ace-one',
      canonicalPacketKey: 'packet:one',
      packetResolutionSource: 'V2_DIRECT',
      sourceBindingReceiptChecksum: makeGroundedSourceBindingReceipt().checksum,
      sourceRevision,
      admitted: false,
      canonicalAuthority: false,
    }]);
    expect(manifestResult.cachedPacketSourceSpanRejections).toEqual([]);
    expect(manifestResult.retrievalCacheIdentity?.featureRevision).toBe('features:r1');
    expect(manifestResult.retrievalCacheIdentity?.workspaceRevision).toBe(workspaceRevision);

    const residencyResult = await adapter.searchWithUnifiedResidency({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision,
      representationRevision: 'semantic_768:r1', candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'ace-playbook:r1', tokenBudget: 1200,
      producerRevision: 'search-snapshot:r1', laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      domain: 'contracts', lutRevision: 'lut:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', ropeRevision: 'rope:r1',
      lut: { contracts: { lutRevision: 'lut:r1', tokenBudget: 1200, featureMask: ['semantic'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } },
      sources: {
        projection: () => ({ packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8, ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5, recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1 }),
        context: () => ({ graphRevision: 'graph:r1', featureRevision: 'features:r1', representationRevision: 'semantic_768:r1', taskKind: 'DEBUG', features: { semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0, processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0, reuseProbability: 0, recency: 0 } }),
      },
    });
    expect(residencyResult.residency.descriptors[0]?.candidateOrdinal).toBe(0);
    expect(residencyResult.residency.routing.lutRevision).toBe('lut:r1');
    expect(residencyResult.writesPerformed).toBe(false);

    const featurePackResult = await adapter.searchWithUnifiedResidencyFeaturePack({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision,
      representationRevision: 'semantic_768:r1', candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'ace-playbook:r1', tokenBudget: 1200,
      producerRevision: 'search-snapshot:r1', laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      domain: 'contracts', lutRevision: 'lut:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', ropeRevision: 'rope:r1',
      rowAlignment: 2,
      lut: { contracts: { lutRevision: 'lut:r1', tokenBudget: 1200, featureMask: ['semantic'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } },
      sources: {
        projection: () => ({ packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8, ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5, recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1 }),
        context: () => ({ graphRevision: 'graph:r1', featureRevision: 'features:r1', representationRevision: 'semantic_768:r1', taskKind: 'DEBUG', features: { semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0, processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0, reuseProbability: 0, recency: 0 } }),
      },
    });
    expect(featurePackResult.pack.featureDtype).toBe('float32');
    expect(featurePackResult.residencies).toHaveLength(1);
    expect(featurePackResult.residencies[0]?.featureBuffer.byteLength).toBe(featurePackResult.pack.featureCount * 4);
    expect(featurePackResult.residencies[0]?.descriptor.state).toBe('EMPTY');
    const loadedResidencies = await Promise.all(featurePackResult.residencies.map((result) => loadUnifiedResidencyFeaturePackV1(result)));
    expect(loadedResidencies).toHaveLength(1);
    expect(loadedResidencies[0]?.state).toBe('RESIDENT');

    const admission = admitSearchRuntimeQasToAceManifestV1({
      projection: result.qas,
      candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1',
      representationRevision: 'semantic_768:r1',
      acePlaybookRevision: 'ace-playbook:r1',
      tokenBudget: 1200,
      graphRevision: 'graph:r1',
      laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      producerRevision: 'search-snapshot:r1',
    });
    expect(admission.manifest.v1.snapshotId).toBe('snapshot:search:r1');
    expect(admission.canonicalAuthority).toBe(false);
  });

  it('returns accepted rows and an exact baseline without writing artifacts', () => {
    const result = projectAtlasSearchResponseToQas({
      requestId: 'request:one',
      policyRevision: 'policy:r1',
      workspaceRevision,
      representationRevision: 'semantic_768:r1',
      response: {
        packets: [{
          chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
          symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
          workspace_revision: workspaceRevision, source_revision: 'source:r1',
          representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
        }],
      } as any,
      projections: [{
        packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
        ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5, recency: 0.4,
        retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
      }],
      resolveFeatures: () => ({
        graphRevision: 'graph:r1', featureRevision: 'features:r1',
        representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
        features: {
          semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
          processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
          reuseProbability: 0, recency: 0,
        },
      }),
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].canonicalId).toBe('symbol:one');
    expect(result.exactBaseline).toEqual([{ canonicalId: 'symbol:one', rank: 1, score: 0.8 }]);
    expect(result.rejected).toHaveLength(0);
  });
});
