import { describe, expect, it } from 'vitest';
import {
  CodeAssetGraphV1Schema,
  codeAssetEdgeId,
  codeAssetId,
  type CodeAssetNodeV1,
} from './code-asset-graph.js';
import { selectCodeSynthesisEvidence } from './code-synthesis-evidence.js';

function asset(input: Partial<CodeAssetNodeV1> & Pick<CodeAssetNodeV1, 'kind' | 'name' | 'qualifiedName' | 'sourceRef' | 'domains'>): CodeAssetNodeV1 {
  return {
    schema: 'atlas.code-asset-node.v1',
    assetId: codeAssetId({ sourceRef: input.sourceRef, kind: input.kind, qualifiedName: input.qualifiedName }),
    kind: input.kind,
    name: input.name,
    qualifiedName: input.qualifiedName,
    sourceRef: input.sourceRef,
    language: input.language ?? 'typescript',
    span: input.span ?? { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
    domains: input.domains,
    exported: input.exported ?? true,
    async: input.async ?? false,
    signature: input.signature ?? input.name,
    sourceRevision: input.sourceRevision ?? 's1',
    workspaceRevision: input.workspaceRevision ?? 'w1',
    tags: input.tags ?? [],
    reusableForNewFileCreation: input.reusableForNewFileCreation ?? true,
    repairEvidenceCandidate: input.repairEvidenceCandidate ?? false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision ?? 'test',
  };
}

function graph() {
  const retrieval = asset({
    kind: 'FUNCTION', name: 'retrieveCandidates', qualifiedName: 'retrieveCandidates',
    sourceRef: 'src/retrieval/retrieve.ts', domains: ['RETRIEVAL', 'RANKING'],
    signature: 'export async function retrieveCandidates()',
  });
  const schema = asset({
    kind: 'ZOD_SCHEMA', name: 'SearchRequestSchema', qualifiedName: 'SearchRequestSchema',
    sourceRef: 'src/retrieval/contracts.ts', domains: ['RETRIEVAL', 'SCHEMA'],
  });
  const turbovec = asset({
    kind: 'SIDECAR', name: 'turbovec-sidecar.py', qualifiedName: 'scripts/ingest/turbovec-sidecar.py',
    sourceRef: 'scripts/ingest/turbovec-sidecar.py', domains: ['TURBOVEC', 'SIDECAR', 'SEMANTIC'],
    language: 'python', span: null,
  });
  const repair = asset({
    kind: 'FUNCTION', name: 'validatePatch', qualifiedName: 'validatePatch',
    sourceRef: 'src/repair/validator.ts', domains: ['AGENTIC_REPAIR', 'VALIDATION', 'AST'],
    repairEvidenceCandidate: true,
  });
  const rows = [retrieval, schema, turbovec, repair];
  const edge = {
    schema: 'atlas.code-asset-edge.v1' as const,
    edgeId: codeAssetEdgeId({ fromAssetId: retrieval.assetId, relation: 'USES_SCHEMA', toAssetId: schema.assetId, sourceRevision: 's1' }),
    fromAssetId: retrieval.assetId,
    toAssetId: schema.assetId,
    relation: 'USES_SCHEMA' as const,
    sourceRef: retrieval.sourceRef,
    confidence: 1,
    exact: true,
    evidence: 'fixture',
    sourceRevision: 's1',
    canonicalWritesAllowed: false as const,
    producerRevision: 'test',
  };
  return CodeAssetGraphV1Schema.parse({
    schema: 'atlas.code-asset-graph.v1',
    graphId: 'a'.repeat(64),
    workspaceRevision: 'w1',
    extractionRevision: 'e1',
    generatedAt: '2026-08-19T19:00:00.000Z',
    sourceRoots: ['src'],
    nodes: rows,
    edges: [edge],
    statistics: { files: 1, symbols: 3, schemas: 1, sidecars: 1, edges: 1 },
    invariants: {
      sourceRefRequired: true, originalsPreserved: true, noMoves: true, noDeletes: true,
      canonicalWritesAllowed: false, executorMultiplicityAddsVotes: false,
    },
    producerRevision: 'test',
  });
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.code-archaeology-query.v1' as const,
    taskKind: 'NEW_FILE' as const,
    queryText: 'create retrieval ranking helper using existing search schema',
    desiredDomains: ['RETRIEVAL', 'RANKING', 'SCHEMA'] as const,
    desiredKinds: [] as const,
    seedSourceRefs: [] as string[],
    maxAssets: 4,
    graphHopBonusDepth: 2,
    workspaceRevision: 'w1',
    queryRevision: 'q1',
    producerRevision: 'test',
    ...overrides,
  };
}

describe('code synthesis archaeology evidence', () => {
  it('ranks reusable retrieval/ranking/schema owners for new-file synthesis', () => {
    const result = selectCodeSynthesisEvidence({ graph: graph(), query: query() });
    expect(result.assets[0]?.domains.some((domain) => ['RETRIEVAL', 'RANKING', 'SCHEMA'].includes(domain))).toBe(true);
    expect(result.assets.some((row) => row.name === 'SearchRequestSchema')).toBe(true);
    expect(result.invariants.directSourceCopyAuthorized).toBe(false);
    expect(result.invariants.exactSourceHydrationRequired).toBe(true);
    expect(result.invariants.mutationDagAuthorizationRequired).toBe(true);
  });

  it('uses exact source_ref and graph distance to expand repair context', () => {
    const result = selectCodeSynthesisEvidence({
      graph: graph(),
      query: query({
        taskKind: 'REPAIR',
        queryText: 'fix retrieval validation failure',
        desiredDomains: ['AGENTIC_REPAIR', 'VALIDATION', 'RETRIEVAL'],
        seedSourceRefs: ['src/retrieval/retrieve.ts'],
      }),
    });
    const seed = result.assets.find((row) => row.sourceRef === 'src/retrieval/retrieve.ts');
    const schema = result.assets.find((row) => row.sourceRef === 'src/retrieval/contracts.ts');
    expect(seed?.reasons).toContain('EXACT_SEED_SOURCE_REF');
    expect(seed?.graphDistanceFromSeed).toBe(0);
    expect(schema?.graphDistanceFromSeed).toBe(1);
  });

  it('emits ACE and RLM handles without adding a retrieval vote', () => {
    const result = selectCodeSynthesisEvidence({ graph: graph(), query: query() });
    expect(result.ace.candidatePacketKeys).toHaveLength(result.assets.length);
    expect(result.rlm.inspectAssetIds).toEqual(result.assets.map((row) => row.assetId));
    expect(result.ace.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(result.invariants.logicalLaneVoteAdded).toBe(false);
  });

  it('surfaces accelerator hints only from selected evidence domains', () => {
    const result = selectCodeSynthesisEvidence({
      graph: graph(),
      query: query({ queryText: 'reuse turbovec semantic sidecar', desiredDomains: ['TURBOVEC', 'SIDECAR'], maxAssets: 1 }),
    });
    expect(result.assets[0]?.name).toBe('turbovec-sidecar.py');
    expect(result.acceleratorHints.turbovecCandidate).toBe(true);
    expect(result.acceleratorHints.diskannCandidate).toBe(false);
  });

  it('is deterministic for the same graph/query even though the graph carries generatedAt metadata', () => {
    const a = selectCodeSynthesisEvidence({ graph: graph(), query: query() });
    const b = selectCodeSynthesisEvidence({ graph: graph(), query: query() });
    expect(b.packId).toBe(a.packId);
    expect(b.assets).toEqual(a.assets);
    expect(b.ace.cacheIdentity).toBe(a.ace.cacheIdentity);
  });

  it('fails closed on a proven workspace revision mismatch', () => {
    expect(() => selectCodeSynthesisEvidence({
      graph: graph(),
      query: query({ workspaceRevision: 'w2' }),
    })).toThrow('CODE_ARCHAEOLOGY_WORKSPACE_REVISION_MISMATCH');
  });
});
