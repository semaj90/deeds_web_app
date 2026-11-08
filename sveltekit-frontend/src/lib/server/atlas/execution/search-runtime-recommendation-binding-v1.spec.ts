import { describe, expect, it } from 'vitest';
import { executeSearchRuntimeTopKV1, type SearchRuntimeTopKCallerInputV1 } from './search-runtime-topk-caller-v1.js';
import { LiveSourceFetchPortV1 } from './live-source-fetch-port-v1.js';
import { sourceRevisionOfBytes } from './topk-evidence-fetch-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar, CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import { TILE_CHANNEL_CANONICAL_INDEX } from './atlas-feature-matrix-4x6-v1.js';
import { compileRecommendationEvidenceBundleV1 } from '../recommendations/recommendation-evidence-bundle-v1.js';

const WORKSPACE = 'workspace:search-runtime:v1';
const REQUEST = 'req:sr-topk:binding-1';
const REPRESENTATION = 'representation:v1';
const GRAPH = 'graph:v1';

function buildFixture() {
  const port = new LiveSourceFetchPortV1({
    spanResolver: (candidate) => {
      if (candidate.canonicalId === 'canon:file-app-d-ts') {
        return { sourceRef: 'src/app.d.ts', unit: 'bytes', start: 0, end: 32 };
      }
      return { sourceRef: 'package.json', unit: 'bytes', start: 0, end: 20 };
    },
  });
  const appRev = sourceRevisionOfBytes(port.readBytes('src/app.d.ts')!);
  const pkgRev = sourceRevisionOfBytes(port.readBytes('package.json')!);
  const featureRevision = 'feature:search-runtime:v1';

  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:search-runtime:v1',
    workspaceRevision: WORKSPACE,
    producerRevision: 'producer:search-runtime:v1',
    candidates: [
      {
        canonicalId: 'canon:file-app-d-ts', packetKey: 'packet:1', sourceRef: 'src/app.d.ts',
        treeNodeId: 'tree:1', symbolVersionId: 'symbol:1', workspaceRevision: WORKSPACE,
        sourceRevision: appRev, graphRevision: GRAPH, semanticRevision: 'semantic:768:v1',
        degradedIdentity: false, evidenceRefs: ['ev:1'],
      },
      {
        canonicalId: 'canon:file-pkg-json', packetKey: 'packet:2', sourceRef: 'package.json',
        treeNodeId: 'tree:2', symbolVersionId: 'symbol:2', workspaceRevision: WORKSPACE,
        sourceRevision: pkgRev, graphRevision: GRAPH, semanticRevision: 'semantic:768:v1',
        degradedIdentity: false, evidenceRefs: ['ev:2'],
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
    ordinalMap, rows, featureRevision, producerRevision: 'producer:snapshot:v1',
  });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'producer:columnar:v1' });

  const input: SearchRuntimeTopKCallerInputV1 = {
    requestId: REQUEST,
    queryDigest: 'query:binding-1',
    graphRevision: GRAPH,
    taxonomyRevision: 'taxonomy:v1',
    featureSchemaRevision: 'feature-schema:v1',
    evidenceRevision: 'evidence:v1',
    producerRevision: 'producer:search-runtime:v1',
    tokenBudget: 4000,
    retrievalPolicyRevision: 'retrieval-policy:v1',
    acePlaybookRevision: 'ace-playbook:v1',
    representationRevision: REPRESENTATION,
    ordinalMap,
    columnar,
    snapshot,
    weights: TILE_CHANNEL_CANONICAL_INDEX.map(() => 0.5),
    k: 2,
    sourceFetchPort: port,
    graphifyLifecycle: 'COMPLETED',
  };
  return { input, ordinalMap, appRev, pkgRev };
}

// Bundle fields mirror the ingress spec's base; only the binding fields vary per test.
function bundleFor(ordinalMap: ReturnType<typeof buildFixture>['ordinalMap'], overrides: Record<string, unknown> = {}) {
  return compileRecommendationEvidenceBundleV1({
    schema: 'atlas.recommendation-evidence-bundle.v1',
    requestId: REQUEST,
    subjectRef: 'packet:binding-fixture',
    workspaceRevision: ordinalMap.workspaceRevision,
    sourceRevision: ordinalMap.candidates[0]!.sourceRevision,
    graphRevision: GRAPH,
    representationId: 'semantic_768',
    representationRevision: REPRESENTATION,
    semanticChecksum: 'a'.repeat(64),
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    candidateOrdinals: [0],
    sample: null,
    graph: [],
    knn: null,
    domain: [],
    okfSchemaRevision: 'okf-r1',
    okfFeatureIds: ['domain.fit'],
    parameters: { topK: 1, graphHops: 0, sampleRank: 0, synthesisBudgetTokens: 128 },
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
    identityAuthority: false,
    ...overrides,
  } as never);
}

describe('SearchRuntime top-K recommendation evidence binding', () => {
  it('absent bundle leaves the existing path unchanged', () => {
    const { input } = buildFixture();
    const result = executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0] });
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('accepts a bundle bound to the exact request, map, revisions and ordinals', () => {
    const { input, ordinalMap } = buildFixture();
    const bundle = JSON.parse(JSON.stringify(bundleFor(ordinalMap)));
    const result = executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0], recommendationEvidence: bundle });
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('rejects a tampered bundle before any compute', () => {
    const { input, ordinalMap } = buildFixture();
    const bundle = bundleFor(ordinalMap);
    expect(() => executeSearchRuntimeTopKV1({
      ...input, candidateOrdinals: [0], recommendationEvidence: { ...bundle, subjectRef: 'packet:tampered' },
    })).toThrow('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  });

  it('rejects a resealed request-id mismatch', () => {
    const { input, ordinalMap } = buildFixture();
    const bundle = bundleFor(ordinalMap, { requestId: 'req:other' });
    expect(() => executeSearchRuntimeTopKV1({
      ...input, candidateOrdinals: [0], recommendationEvidence: bundle,
    })).toThrow('RECOMMENDATION_BINDING_REQUEST_MISMATCH');
  });

  it('rejects an ordinal-map checksum mismatch', () => {
    const { input, ordinalMap } = buildFixture();
    const bundle = bundleFor(ordinalMap, { ordinalMapChecksum: 'b'.repeat(64) });
    expect(() => executeSearchRuntimeTopKV1({
      ...input, candidateOrdinals: [0], recommendationEvidence: bundle,
    })).toThrow('RECOMMENDATION_BINDING_ORDINAL_MAP_MISMATCH');
  });

  it('rejects a requested ordinal the bundle does not cover', () => {
    const { input, ordinalMap } = buildFixture();
    const bundle = bundleFor(ordinalMap);
    expect(() => executeSearchRuntimeTopKV1({
      ...input, candidateOrdinals: [0, 1], recommendationEvidence: bundle,
    })).toThrow('RECOMMENDATION_BINDING_ORDINAL_NOT_COVERED:1');
  });

  it('rejects a per-candidate source revision mismatch', () => {
    const { input, ordinalMap, pkgRev } = buildFixture();
    const bundle = bundleFor(ordinalMap, { sourceRevision: pkgRev });
    expect(() => executeSearchRuntimeTopKV1({
      ...input, candidateOrdinals: [0], recommendationEvidence: bundle,
    })).toThrow('RECOMMENDATION_BINDING_SOURCE_REVISION_MISMATCH:0');
  });

  it('emits a typed recommendation binding receipt and proves unchanged Top-K rankings', () => {
    const { input, ordinalMap } = buildFixture();
    const baseline = executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0] });
    expect(baseline.recommendationBinding).toBeNull();

    const bundle = bundleFor(ordinalMap);
    const withBundle = executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0], recommendationEvidence: bundle });
    expect(withBundle.recommendationBinding).not.toBeNull();
    expect(withBundle.recommendationBinding?.status).toBe('VERIFIED');
    expect(withBundle.recommendationBinding?.bundleChecksum).toBe(bundle.bundleChecksum);
    expect(withBundle.recommendationBinding?.coveredOrdinals).toEqual([0]);

    // Unchanged ranking Top-K identity
    expect(withBundle.execution.selected).toEqual(baseline.execution.selected);
  });

  it('documents that a multi-source cohort with no subject match skips the per-candidate source-revision check', () => {
    // Deliberate rule: the bundle attests its subject, not every file in a multi-file cohort.
    // Workspace, ordinal-map, representation and ordinal coverage are still enforced.
    const { input, ordinalMap, appRev, pkgRev } = buildFixture();
    const bundle = bundleFor(ordinalMap, {
      subjectRef: 'src/not-in-cohort.ts',
      sourceRevision: appRev === pkgRev ? 'sha256:' + '0'.repeat(64) : pkgRev,
      candidateOrdinals: [0, 1],
    });
    const result = executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0, 1], recommendationEvidence: bundle });
    expect(result.recommendationBinding?.status).toBe('VERIFIED');
    // Coverage is still required: dropping an ordinal fails closed even with no subject match.
    const partial = bundleFor(ordinalMap, { subjectRef: 'src/not-in-cohort.ts', candidateOrdinals: [0] });
    expect(() => executeSearchRuntimeTopKV1({ ...input, candidateOrdinals: [0, 1], recommendationEvidence: partial }))
      .toThrow('RECOMMENDATION_BINDING_ORDINAL_NOT_COVERED:1');
  });

  it('supports multi-source cohort coverage when subject source revision matches', () => {
    const { input, ordinalMap, appRev } = buildFixture();
    const multiBundle = bundleFor(ordinalMap, {
      subjectRef: 'src/app.d.ts',
      sourceRevision: appRev,
      candidateOrdinals: [0, 1],
    });
    const result = executeSearchRuntimeTopKV1({
      ...input,
      candidateOrdinals: [0, 1],
      recommendationEvidence: multiBundle,
    });
    expect(result.recommendationBinding?.status).toBe('VERIFIED');
    expect(result.recommendationBinding?.coveredOrdinals).toEqual([0, 1]);
    expect(result.writesPerformed).toBe(false);
  });
});
