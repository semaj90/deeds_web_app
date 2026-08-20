import { describe, expect, it } from 'vitest';
import { joinAstCandidateToCanonicalCoordinates } from './ast-canonical-coordinate-join.js';
import { AstGrepStructuralCandidateV1Schema } from './ast-grep-structural-topk.js';

const candidate = AstGrepStructuralCandidateV1Schema.parse({
  schema: 'atlas.ast-grep-structural-candidate.v1',
  entityKind: 'FUNCTION',
  declarationForm: 'FUNCTION_DECLARATION',
  name: 'scoreCandidate',
  nodeKind: 'function_declaration',
  signature: 'export function scoreCandidate(value: number) {',
  isExported: true,
  isAsync: false,
  sourceRef: 'src/example.ts',
  filePath: '/workspace/src/example.ts',
  startByte: 10,
  endByte: 70,
  startLine: 0,
  startColumn: 0,
  endLine: 2,
  endColumn: 1,
  treeNodeId: null,
  symbolVersionId: null,
  workspaceRevision: 'ws-1',
  sourceRevision: 'src-1',
  engine: 'AST_GREP_NAPI',
  structuralMatchExactForDeclaredRule: true,
  requiresCanonicalTreeJoin: true,
  logicalLane: 'ast',
  logicalLaneVoteAdded: false,
  canonicalWritesAllowed: false,
  producerRevision: 'test',
});

function observation(identityStatus: 'structural_pending_canonical_persistence' | 'canonical_structural_identity', overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.canonical-structural-observation.v1' as const,
    sourceRef: 'src/example.ts',
    sourceRevision: 'src-1',
    treeNodeId: 'tree-8421',
    symbolVersionId: 'symbol-331',
    identityStatus,
    nodeKind: 'function',
    qualifiedSymbol: 'scoreCandidate',
    startByte: 10,
    endByte: 70,
    grammarRevision: 'tree-sitter-typescript-0.23.2',
    producerRevision: 'canonical-owner-test',
    ...overrides,
  };
}

describe('canonical AST coordinate join gate', () => {
  it('does not promote a provisional structural hash into treeNodeId', () => {
    const result = joinAstCandidateToCanonicalCoordinates({
      schema: 'atlas.ast-canonical-coordinate-join-input.v1',
      candidate,
      observations: [observation('structural_pending_canonical_persistence')],
      producerRevision: 'join-test',
    });

    expect(result.status).toBe('PROVISIONAL_MATCH_ONLY');
    expect(result.provisionalIdentityObserved).toBe(true);
    expect(result.canonicalIdentityPromoted).toBe(false);
    expect(result.candidateAfter.treeNodeId).toBeNull();
    expect(result.candidateAfter.symbolVersionId).toBeNull();
    expect(result.candidateAfter.requiresCanonicalTreeJoin).toBe(true);
  });

  it('promotes coordinates only when the structural owner attests canonical identity', () => {
    const result = joinAstCandidateToCanonicalCoordinates({
      schema: 'atlas.ast-canonical-coordinate-join-input.v1',
      candidate,
      observations: [observation('canonical_structural_identity')],
      producerRevision: 'join-test',
    });

    expect(result.status).toBe('CANONICAL_JOINED');
    expect(result.candidateAfter.treeNodeId).toBe('tree-8421');
    expect(result.candidateAfter.symbolVersionId).toBe('symbol-331');
    expect(result.candidateAfter.requiresCanonicalTreeJoin).toBe(false);
    expect(result.canonicalIdentityPromoted).toBe(true);
  });

  it('rejects revision drift rather than matching by name alone', () => {
    const result = joinAstCandidateToCanonicalCoordinates({
      schema: 'atlas.ast-canonical-coordinate-join-input.v1',
      candidate,
      observations: [observation('canonical_structural_identity', { sourceRevision: 'src-2' })],
      producerRevision: 'join-test',
    });

    expect(result.status).toBe('REVISION_MISMATCH');
    expect(result.candidateAfter.treeNodeId).toBeNull();
  });

  it('requires exact byte-span agreement', () => {
    const result = joinAstCandidateToCanonicalCoordinates({
      schema: 'atlas.ast-canonical-coordinate-join-input.v1',
      candidate,
      observations: [observation('canonical_structural_identity', { startByte: 11 })],
      producerRevision: 'join-test',
    });

    expect(result.status).toBe('NO_MATCH');
  });

  it('refuses ambiguous canonical observations', () => {
    const result = joinAstCandidateToCanonicalCoordinates({
      schema: 'atlas.ast-canonical-coordinate-join-input.v1',
      candidate,
      observations: [
        observation('canonical_structural_identity'),
        observation('canonical_structural_identity', { treeNodeId: 'tree-other' }),
      ],
      producerRevision: 'join-test',
    });

    expect(result.status).toBe('AMBIGUOUS_MATCH');
    expect(result.candidateAfter.treeNodeId).toBeNull();
    expect(result.canonicalIdentityPromoted).toBe(false);
  });
});
