import { describe, expect, it } from 'vitest';
import { executeSearchRuntimeTopKV1, type SearchRuntimeTopKCallerInputV1 } from './search-runtime-topk-caller-v1.js';
import { LiveSourceFetchPortV1 } from './live-source-fetch-port-v1.js';
import { sourceRevisionOfBytes } from './topk-evidence-fetch-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar, CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import { buildCandidateOrdinalBitsetSelectionV1 } from '../features/candidate-ordinal-bitset-selection-v1.js';
import { TILE_CHANNEL_CANONICAL_INDEX } from './atlas-feature-matrix-4x6-v1.js';
import { executeSearchRuntimeWithComputeBridgeV1 } from './search-runtime-compute-bridge-v1.js';

function fixtureFeatureArtifact(ordinalMap: SearchRuntimeTopKCallerInputV1['ordinalMap'], snapshot: SearchRuntimeTopKCallerInputV1['snapshot']) {
  return {
    schema: 'atlas.tensor-artifact-manifest.v1' as const,
    artifactId: 'fixture:candidate-feature-matrix',
    artifactKind: 'CANDIDATE_FEATURE_MATRIX' as const,
    artifactFormat: 'ARROW_IPC' as const,
    artifactUri: 'atlas-artifact://fixtures/search-runtime-features.arrow',
    artifactChecksum: `sha256:${'9'.repeat(64)}`,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationId: null,
    representationRevision: null,
    featureSchemaRevision: snapshot.featureRevision,
    rowCount: ordinalMap.rowCount,
    columnCount: CANDIDATE_SCALAR_FEATURES.length,
    shape: [ordinalMap.rowCount, CANDIDATE_SCALAR_FEATURES.length],
    dtype: 'float32' as const,
    byteLength: ordinalMap.rowCount * CANDIDATE_SCALAR_FEATURES.length * 4,
    producerId: 'search-runtime-test',
    producerRevision: 'search-runtime-test:v1',
    canonicalAuthority: false as const,
  };
}

describe('SearchRuntime Top-K Caller (v1)', () => {
  it('executes end-to-end CPU Top-K with independent verification and live source qualification', () => {
    const port = new LiveSourceFetchPortV1({
      spanResolver: (candidate) => {
        if (candidate.canonicalId === 'canon:file-app-d-ts') {
          return { sourceRef: 'src/app.d.ts', unit: 'bytes', start: 0, end: 32 };
        }
        return { sourceRef: 'package.json', unit: 'bytes', start: 0, end: 20 };
      },
    });

    const appBytes = port.readBytes('src/app.d.ts');
    const pkgBytes = port.readBytes('package.json');
    expect(appBytes).not.toBeNull();
    expect(pkgBytes).not.toBeNull();

    const appRev = sourceRevisionOfBytes(appBytes!);
    const pkgRev = sourceRevisionOfBytes(pkgBytes!);

    const workspaceRevision = 'workspace:search-runtime:v1';
    const featureRevision = 'feature:search-runtime:v1';

    const ordinalMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'snapshot:search-runtime:v1',
      workspaceRevision,
      producerRevision: 'producer:search-runtime:v1',
      candidates: [
        {
          canonicalId: 'canon:file-app-d-ts',
          packetKey: 'packet:1',
          sourceRef: 'src/app.d.ts',
          treeNodeId: 'tree:1',
          symbolVersionId: 'symbol:1',
          workspaceRevision,
          sourceRevision: appRev,
          graphRevision: 'graph:v1',
          semanticRevision: 'semantic:768:v1',
          degradedIdentity: false,
          evidenceRefs: ['ev:1'],
        },
        {
          canonicalId: 'canon:file-pkg-json',
          packetKey: 'packet:2',
          sourceRef: 'package.json',
          treeNodeId: 'tree:2',
          symbolVersionId: 'symbol:2',
          workspaceRevision,
          sourceRevision: pkgRev,
          graphRevision: 'graph:v1',
          semanticRevision: 'semantic:768:v1',
          degradedIdentity: false,
          evidenceRefs: ['ev:2'],
        },
      ],
    });

    const rows = ordinalMap.candidates.map((c, ordinal) => {
      const scalar: Record<string, number | null> = {};
      CANDIDATE_SCALAR_FEATURES.forEach((feat, idx) => {
        scalar[feat] = feat.startsWith('crossEncoder') ? null : (ordinal + 1) * 0.1 + idx * 0.05;
      });
      return {
        schema: 'atlas.candidate-feature-row.v1' as const,
        candidateOrdinal: ordinal,
        canonicalId: c.canonicalId,
        packetKey: c.packetKey,
        sourceRef: c.sourceRef,
        treeNodeId: c.treeNodeId,
        symbolVersionId: c.symbolVersionId,
        workspaceRevision: c.workspaceRevision,
        sourceRevision: c.sourceRevision,
        graphRevision: c.graphRevision,
        semanticRevision: c.semanticRevision,
        featureRevision,
        ...scalar,
        crossEncoderAvailable: false,
        laneMask: ['semantic' as const],
        degradedIdentity: c.degradedIdentity,
        evidenceRefs: c.evidenceRefs,
      };
    });

    const snapshot = materializeCandidateFeatureSnapshot({
      ordinalMap,
      rows,
      featureRevision,
      producerRevision: 'producer:snapshot:v1',
    });

    const columnar = materializeCandidateFeatureColumnar({
      snapshot,
      producerRevision: 'producer:columnar:v1',
    });

    // Run the SearchRuntime Top-K caller
    const searchInput: SearchRuntimeTopKCallerInputV1 = {
      requestId: 'req:sr-topk:test-1',
      queryDigest: 'query:test-1',
      graphRevision: 'graph:v1',
      taxonomyRevision: 'taxonomy:v1',
      featureSchemaRevision: 'feature-schema:v1',
      evidenceRevision: 'evidence:v1',
      producerRevision: 'producer:search-runtime:v1',
      tokenBudget: 4000,
      retrievalPolicyRevision: 'retrieval-policy:v1',
      acePlaybookRevision: 'ace-playbook:v1',
      representationRevision: 'representation:v1',
      ordinalMap,
      columnar,
      snapshot,
      weights: TILE_CHANNEL_CANONICAL_INDEX.map(() => 0.5),
      k: 2,
      sourceFetchPort: port,
      graphifyLifecycle: 'COMPLETED',
    };
    const result = executeSearchRuntimeTopKV1(searchInput);

    // Assertions
    expect(result.schema).toBe('atlas.search-runtime-topk-execution-result.v1');
    expect(result.verification.status).toBe('VERIFIED_PASS');
    expect(result.evidence.qualified).toHaveLength(2);
    expect(result.evidence.rejected).toHaveLength(0);
    expect(result.contextManifestAdmission.status).toBe('ADMITTED');
    expect(result.status).toBe('QUALIFIED_ADMITTED');
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.receiptRow.execution_id).toMatch(/^topk:[a-f0-9]{64}$/);
    expect(result.receiptRow.algorithm).toBe('cpu_exact_stable_topk');
    expect(result.execution.algorithm).toBe('cpu_exact');

    const bridged = executeSearchRuntimeWithComputeBridgeV1({
      search: searchInput,
      selection: buildCandidateOrdinalBitsetSelectionV1({ ordinalMap, selectedOrdinals: [0] }),
      inputArtifactManifest: fixtureFeatureArtifact(ordinalMap, snapshot),
      operation: 'EXACT_TOPK',
      executorHint: 'CPU',
    });
    expect(bridged.status).toBe('DESCRIPTOR_VALIDATED');
    expect(bridged.executionResult.execution.candidateOrdinals).toEqual([0]);
    expect(bridged.descriptors).toHaveLength(1);
    expect(bridged.descriptors[0]).toMatchObject({
      packetKey: ordinalMap.candidates[0]?.packetKey,
      candidateOrdinal: 0,
      operation: 'EXACT_TOPK',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  it('fails closed when candidate source revision does not match disk bytes', () => {
    const port = new LiveSourceFetchPortV1({
      spanResolver: () => ({ sourceRef: 'src/app.d.ts', unit: 'bytes', start: 0, end: 32 }),
    });

    const staleRevision = 'sha256:' + 'f'.repeat(64);
    const workspaceRevision = 'workspace:search-runtime:v1';
    const featureRevision = 'feature:search-runtime:v1';

    const ordinalMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'snapshot:search-runtime:v2',
      workspaceRevision,
      producerRevision: 'producer:search-runtime:v1',
      candidates: [
        {
          canonicalId: 'canon:stale-file',
          packetKey: 'packet:stale',
          sourceRef: 'src/app.d.ts',
          treeNodeId: 'tree:stale',
          symbolVersionId: 'symbol:stale',
          workspaceRevision,
          sourceRevision: staleRevision,
          graphRevision: 'graph:v1',
          semanticRevision: 'semantic:768:v1',
          degradedIdentity: false,
          evidenceRefs: ['ev:stale'],
        },
      ],
    });

    const rows = ordinalMap.candidates.map((c, ordinal) => {
      const scalar: Record<string, number | null> = {};
      CANDIDATE_SCALAR_FEATURES.forEach((feat) => {
        scalar[feat] = feat.startsWith('crossEncoder') ? null : 0.5;
      });
      return {
        schema: 'atlas.candidate-feature-row.v1' as const,
        candidateOrdinal: ordinal,
        canonicalId: c.canonicalId,
        packetKey: c.packetKey,
        sourceRef: c.sourceRef,
        treeNodeId: c.treeNodeId,
        symbolVersionId: c.symbolVersionId,
        workspaceRevision: c.workspaceRevision,
        sourceRevision: c.sourceRevision,
        graphRevision: c.graphRevision,
        semanticRevision: c.semanticRevision,
        featureRevision,
        ...scalar,
        crossEncoderAvailable: false,
        laneMask: ['semantic' as const],
        degradedIdentity: c.degradedIdentity,
        evidenceRefs: c.evidenceRefs,
      };
    });

    const snapshot = materializeCandidateFeatureSnapshot({
      ordinalMap,
      rows,
      featureRevision,
      producerRevision: 'producer:snapshot:v1',
    });

    const columnar = materializeCandidateFeatureColumnar({
      snapshot,
      producerRevision: 'producer:columnar:v1',
    });

    const result = executeSearchRuntimeTopKV1({
      requestId: 'req:sr-topk:test-2',
      queryDigest: 'query:test-2',
      graphRevision: 'graph:v1',
      taxonomyRevision: 'taxonomy:v1',
      featureSchemaRevision: 'feature-schema:v1',
      evidenceRevision: 'evidence:v1',
      producerRevision: 'producer:search-runtime:v1',
      tokenBudget: 4000,
      retrievalPolicyRevision: 'retrieval-policy:v1',
      acePlaybookRevision: 'ace-playbook:v1',
      representationRevision: 'representation:v1',
      ordinalMap,
      columnar,
      snapshot,
      weights: TILE_CHANNEL_CANONICAL_INDEX.map(() => 0.5),
      k: 1,
      sourceFetchPort: port,
      graphifyLifecycle: 'COMPLETED',
    });

    // Verification must pass (scoring math is correct), but evidence qualification must fail closed
    expect(result.verification.status).toBe('VERIFIED_PASS');
    expect(result.evidence.qualified).toHaveLength(0);
    expect(result.evidence.rejected).toHaveLength(1);
    expect(result.evidence.rejected[0].reason).toBe('SOURCE_REVISION_STALE');
    expect(result.contextManifestAdmission.status).toBe('BLOCKED');
    expect(result.status).toBe('BLOCKED_EVIDENCE_UNQUALIFIED');
  });

  it('rejects missing revisions and Graphify lifecycle instead of inventing defaults', () => {
    const incomplete = {
      requestId: 'req:missing-lineage',
      queryDigest: 'query:fixture',
      graphRevision: '',
      taxonomyRevision: 'taxonomy:fixture',
      featureSchemaRevision: 'schema:fixture',
      evidenceRevision: 'evidence:fixture',
      producerRevision: 'producer:fixture',
      tokenBudget: 100,
      retrievalPolicyRevision: 'policy:fixture',
      acePlaybookRevision: 'playbook:fixture',
      representationRevision: 'representation:fixture',
    } as unknown as SearchRuntimeTopKCallerInputV1;

    expect(() => executeSearchRuntimeTopKV1(incomplete)).toThrow(
      'SEARCH_RUNTIME_TOPK_REQUIRED_REVISION:graphRevision',
    );

    incomplete.graphRevision = 'graph:fixture';
    expect(() => executeSearchRuntimeTopKV1(incomplete)).toThrow(
      'SEARCH_RUNTIME_TOPK_GRAPHIFY_LIFECYCLE_REQUIRED',
    );
  });
});
