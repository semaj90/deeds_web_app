import { describe, it, expect, vi } from 'vitest';
import {
  admitLogicalSymbolRegistryV1, qualifySymbolVersionRevisionsV1, qualifyPromotionNominationV1, guardedSymbolMutationV1,
  loadBindingProvenanceV1, provenanceForV1, type BindingProvenanceV1,
} from './symbol-revision-qualification-v1';

const H = (c: string, n = 64) => c.repeat(n);
const DIGEST = H('a');
const SRC = `sha256:${DIGEST}`;
const WS = `sha256:${H('b')}`;
const REF = 'src/lib/x.ts';
const OID = '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf';
const PROV: BindingProvenanceV1[] = [{ sourceRef: REF, sourceRevision: SRC, workspaceRevision: WS, contentDigest: DIGEST }];
const ver = (sourceRevision: string | null, workspaceRevision: string | null = WS, provenance = PROV, sourceRef: string | null = REF) => qualifySymbolVersionRevisionsV1({ sourceRef, sourceRevision, workspaceRevision, provenance });
const reg = (createdFromSourceRevision: string | null, provenance = PROV, registryRevision: string | null = 'promotion:ast-nominations:v1') => admitLogicalSymbolRegistryV1({ sourceRef: REF, createdFromSourceRevision, registryRevision, provenance });

describe('SymbolVersionRevisionQualificationV1', () => {
  it('accepts canonical workspace + source revision with exact provenance', () => {
    expect(ver(SRC)).toEqual({ admitted: true, reasons: [] });
  });
  it.each(['workspace:0', 'workspace:1', 'workspace:999'])('rejects %s as WORKSPACE_REVISION_PLACEHOLDER', (w) => {
    expect(ver(SRC, w).reasons).toEqual(['WORKSPACE_REVISION_PLACEHOLDER']);
  });
  it('rejects raw 40-hex Git commits and arbitrary 40-hex as SOURCE_REVISION_GIT_COMMIT', () => {
    expect(ver(OID).reasons).toContain('SOURCE_REVISION_GIT_COMMIT');
    expect(ver(H('c', 40)).reasons).toContain('SOURCE_REVISION_GIT_COMMIT');
  });
  it('rejects sha256:<40 hex> as LEGACY_40HEX and never treats it as convertible', () => {
    expect(ver(`sha256:${OID}`).reasons).toContain('SOURCE_REVISION_LEGACY_40HEX');
  });
  it.each([[`sha256:${H('a', 63)}`], [`sha256:${H('a', 65)}`], [`sha256:${H('A')}`], ['garbage']])('rejects malformed %s as SOURCE_REVISION_INVALID', (s) => {
    expect(ver(s).reasons).toContain('SOURCE_REVISION_INVALID');
  });
  it('rejects empty and missing source revision', () => {
    expect(ver('').reasons).toContain('SOURCE_REVISION_MISSING');
    expect(ver(null).reasons).toContain('SOURCE_REVISION_MISSING');
  });
  it('rejects invalid workspace revision shape', () => {
    expect(ver(SRC, 'nope').reasons).toEqual(['WORKSPACE_REVISION_INVALID']);
    expect(ver(SRC, null).reasons).toEqual(['WORKSPACE_REVISION_INVALID']);
  });
  it('requires provenance even for a valid-looking sha256', () => {
    expect(ver(SRC, WS, []).reasons).toEqual(['REVISION_PROVENANCE_MISSING']);
  });
  it('rejects provenance for a different ref, revision, workspace, or a digest that does not produce the revision', () => {
    expect(ver(SRC, WS, [{ ...PROV[0], sourceRef: 'other.ts' }]).admitted).toBe(false);
    expect(ver(SRC, WS, [{ ...PROV[0], workspaceRevision: `sha256:${H('d')}` }]).admitted).toBe(false);
    expect(ver(SRC, WS, [{ ...PROV[0], contentDigest: H('e') }]).admitted).toBe(false);
  });
});

describe('LogicalSymbolRegistryAdmissionV1', () => {
  it('admits a qualified nomination with provenance', () => expect(reg(SRC).admitted).toBe(true));
  it('registry skeleton with no authoritative revision fails closed with REGISTRY_SCHEMA_REQUIRES_PLACEHOLDER (no sentinel offered)', () => {
    for (const v of [null, '']) expect(reg(v).reasons).toEqual(['SOURCE_REVISION_MISSING', 'REGISTRY_SCHEMA_REQUIRES_PLACEHOLDER']);
  });
  it('rejects workspace:0 and Git commit as registry revision with precise reasons', () => {
    expect(reg('workspace:0').reasons).toEqual(['SOURCE_REVISION_INVALID']);
    expect(reg(OID).reasons).toEqual(['SOURCE_REVISION_GIT_COMMIT']);
  });
  it('requires provenance', () => expect(reg(SRC, []).reasons).toEqual(['REVISION_PROVENANCE_MISSING']));
});

describe('promotion nomination (registry + aliases + version in one package transaction)', () => {
  it('needs both admissions', () => {
    expect(qualifyPromotionNominationV1({ source_ref: REF, source_revision: SRC, workspace_revision: WS }, 'r', PROV).admitted).toBe(true);
    expect(qualifyPromotionNominationV1({ source_ref: REF, source_revision: SRC, workspace_revision: 'workspace:0' }, 'r', PROV).reasons).toEqual(['WORKSPACE_REVISION_PLACEHOLDER']);
    // reconciliation writer historically set source_revision = workspace revision: shape ok, no source binding -> rejected
    expect(qualifyPromotionNominationV1({ source_ref: REF, source_revision: WS, workspace_revision: WS }, 'r', PROV).reasons).toEqual(['REVISION_PROVENANCE_MISSING']);
  });
});

describe('rejection is non-mutating', () => {
  it('never invokes the mutation for rejected input, invokes it once for admitted input', async () => {
    const mutate = vi.fn(async () => 'ok');
    for (const v of [ver('workspace:0'), ver(OID), ver(null), ver(SRC, WS, []), reg(null)]) {
      expect((await guardedSymbolMutationV1(v, mutate)).mutated).toBe(false);
    }
    expect(mutate).not.toHaveBeenCalled();
    expect(await guardedSymbolMutationV1(ver(SRC), mutate)).toEqual({ mutated: true, result: 'ok' });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

describe('loadBindingProvenanceV1', () => {
  it('issues one read-only SELECT and keys candidates by (ref, revision)', async () => {
    const query = vi.fn(async () => ({ rows: [{ canonical_source_ref: REF, source_revision: SRC, workspace_revision: WS, content_digest: DIGEST }] }));
    const map = await loadBindingProvenanceV1({ query }, [{ sourceRef: REF, sourceRevision: SRC }, { sourceRef: null, sourceRevision: SRC }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String((query.mock.calls[0] as unknown[])[0])).toMatch(/^SELECT /);
    expect(provenanceForV1(map, REF, SRC)).toEqual(PROV);
    expect(provenanceForV1(map, REF, 'workspace:0')).toEqual([]);
  });
});
