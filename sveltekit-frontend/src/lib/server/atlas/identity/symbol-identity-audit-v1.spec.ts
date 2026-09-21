import { describe, expect, it } from 'vitest';
import { auditSymbolIdentityV1, revisionShapeV1, versionAdmissibleV1, type RegistryRowV1, type SymbolVersionRowV1 } from './symbol-identity-audit-v1';

const R = (c: string) => `sha256:${c.repeat(64)}`;
const ver = (over: Partial<SymbolVersionRowV1> = {}): SymbolVersionRowV1 => ({ symbolVersionId: 'v1', stableSymbolId: 's1', sourceRevision: R('a'), workspaceRevision: R('b'), upstreamNodeId: 'n1', upstreamFileId: 'f1', declarationHash: 'h1', qualifiedName: 'main', sourceRef: 'a.ts', ...over });
const reg = (over: Partial<RegistryRowV1> = {}): RegistryRowV1 => ({ stableSymbolId: 's1', createdFromSourceRevision: R('a'), canonicalKey: 'symbol:ts:hashonly', status: 'active', ...over });

describe('SymbolIdentityAuditV1', () => {
  it('classifies revision shapes and never accepts a placeholder or short oid as qualified', () => {
    expect(revisionShapeV1(R('a'))).toBe('QUALIFIED_SHA256');
    expect(revisionShapeV1('workspace:0')).toBe('PLACEHOLDER');
    expect(revisionShapeV1('a'.repeat(40))).toBe('SHORT_OID');
    expect(revisionShapeV1(null)).toBe('MISSING');
    expect(versionAdmissibleV1(ver({ sourceRevision: 'workspace:0' })).ok).toBe(false);
    expect(versionAdmissibleV1(ver({ sourceRevision: 'a'.repeat(40) })).reasons).toContain('SOURCE_REVISION_SHORT_OID');
    expect(versionAdmissibleV1(ver({ upstreamFileId: null })).reasons).toContain('STABLE_FILE_LINK_ABSENT');
    expect(versionAdmissibleV1(ver()).ok).toBe(true);
  });

  it('a clean, revision-qualified, file-linked, path-independent registry passes every predicate it can observe', () => {
    const a = auditSymbolIdentityV1({ registry: [reg()], versions: [ver()], aliasKinds: { move: 1 } });
    expect(a.predicates.VERSION_HAS_QUALIFIED_SOURCE_REVISION.state).toBe('PROVEN');
    expect(a.predicates.STABLE_FILE_LINK.state).toBe('PROVEN');
    // an opaque-hash key does not by itself prove the hash input excludes the path
    expect(a.predicates.SYMBOL_ID_PATH_INDEPENDENT.state).toBe('BLOCKED_NO_EVIDENCE');
    expect(a.predicates.MOVE_AND_RENAME.state).toBe('OBSERVED');
  });

  it('an ACTIVE key that embeds a file path is VIOLATED, while a retired legacy one is only counted; placeholder revisions and a shared tree node are VIOLATED', () => {
    const a = auditSymbolIdentityV1({
      registry: [reg({ canonicalKey: 'symbol:ts:src/a.ts:function:main:abc', createdFromSourceRevision: 'workspace:0' })],
      versions: [ver(), ver({ symbolVersionId: 'v2', stableSymbolId: 's2', sourceRevision: 'workspace:0' })],
      aliasKinds: {},
    });
    expect(a.predicates.SYMBOL_ID_PATH_INDEPENDENT.state).toBe('VIOLATED');
    expect(a.predicates.REGISTRY_CREATED_FROM_QUALIFIED_REVISION.state).toBe('VIOLATED');
    expect(a.predicates.VERSION_HAS_QUALIFIED_SOURCE_REVISION.state).toBe('VIOLATED');
    expect(a.predicates.TREE_NODE_OCCURRENCE_UNIQUE_TO_SYMBOL.state).toBe('VIOLATED'); // n1 attached to s1 and s2
    const retired = auditSymbolIdentityV1({ registry: [reg({ canonicalKey: 'symbol:ts:src/a.ts:function:main:abc', status: 'retired' })], versions: [ver()], aliasKinds: {} });
    expect(retired.registry.retiredKeysEmbeddingAFilePath).toBe(1);
    expect(retired.predicates.SYMBOL_ID_PATH_INDEPENDENT.state).toBe('BLOCKED_NO_EVIDENCE');
  });

  it('no multi-revision or move evidence is BLOCKED_NO_EVIDENCE, never a pass', () => {
    const a = auditSymbolIdentityV1({ registry: [reg()], versions: [ver()], aliasKinds: { symbol_key: 1 } });
    expect(a.predicates.UNCHANGED_AND_CHANGED_SYMBOL_ACROSS_REVISIONS.state).toBe('BLOCKED_NO_EVIDENCE');
    expect(a.predicates.MOVE_AND_RENAME.state).toBe('BLOCKED_NO_EVIDENCE');
  });

  it('UNCHANGED symbol across two revisions and CHANGED symbol across two revisions are both observed as multi-revision', () => {
    const versions = [ver({ symbolVersionId: 'v1' }), ver({ symbolVersionId: 'v2', sourceRevision: R('c') }), ver({ symbolVersionId: 'v3', stableSymbolId: 's2', upstreamNodeId: 'n2', declarationHash: 'x1' }), ver({ symbolVersionId: 'v4', stableSymbolId: 's2', upstreamNodeId: 'n3', sourceRevision: R('c'), declarationHash: 'x2' })];
    const a = auditSymbolIdentityV1({ registry: [reg(), reg({ stableSymbolId: 's2' })], versions, aliasKinds: {} });
    expect(a.predicates.UNCHANGED_AND_CHANGED_SYMBOL_ACROSS_REVISIONS.state).toBe('OBSERVED');
    expect(a.versions.admissible).toBe(4);
  });

  it('the tree node is never the canonical symbol id', () => {
    expect(auditSymbolIdentityV1({ registry: [reg()], versions: [ver({ upstreamNodeId: 's1' })], aliasKinds: {} }).predicates.TREE_NODE_NOT_CANONICAL_SYMBOL_ID.state).toBe('VIOLATED');
  });
});
