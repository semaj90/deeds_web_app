import { describe, expect, it } from 'vitest';
import { qualifySealedGraphifyBindingsV1 } from './sealed-graphify-binding-qualification-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const source = { sourceRef: 'src/a.ts', sourceRevision, contentDigest: sourceRevision.slice(7), byteLength: 12 };
const binding = {
  repo_id: 'deeds-web-app', canonical_source_ref: source.sourceRef, workspace_revision: workspaceRevision,
  source_revision: sourceRevision, content_digest: source.contentDigest, byte_length: '12',
};
const base = { sources: [source], workspaceRevision, repositoryId: 'deeds-web-app' };

describe('qualifySealedGraphifyBindingsV1', () => {
  it('qualifies only exact repository, workspace, source revision, digest and byte length bindings', () => {
    const result = qualifySealedGraphifyBindingsV1({ ...base, bindingRows: [binding] });
    expect(result.counts).toEqual({ exact: 1, missing: 0, duplicate: 0, mismatch: 0 });
    expect(result.qualifiedSourceRefs).toEqual(['src/a.ts']);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects a binding from another workspace or repository', () => {
    const result = qualifySealedGraphifyBindingsV1({
      ...base,
      bindingRows: [{ ...binding, workspace_revision: `sha256:${'c'.repeat(64)}`, repo_id: 'repo:other' }],
    });
    expect(result.counts.mismatch).toBe(1);
    expect(result.classifications[0].reasons).toEqual(['REPOSITORY_ID', 'WORKSPACE_REVISION']);
    expect(result.qualifiedSourceRefs).toEqual([]);
  });

  it('rejects source revision, content digest and byte-length drift independently', () => {
    const result = qualifySealedGraphifyBindingsV1({
      ...base,
      bindingRows: [{ ...binding, source_revision: `sha256:${'d'.repeat(64)}`, content_digest: 'e'.repeat(64), byte_length: '13' }],
    });
    expect(result.classifications[0].reasons).toEqual(['SOURCE_REVISION', 'CONTENT_DIGEST', 'BYTE_LENGTH']);
  });

  it('does not promote missing or duplicate binding rows', () => {
    const missing = qualifySealedGraphifyBindingsV1({ ...base, bindingRows: [] });
    const duplicate = qualifySealedGraphifyBindingsV1({ ...base, bindingRows: [binding, binding] });
    expect(missing.counts.missing).toBe(1);
    expect(duplicate.counts.duplicate).toBe(1);
    expect(duplicate.qualifiedSourceRefs).toEqual([]);
  });

  it('rejects duplicated expected source refs and malformed source revisions', () => {
    expect(() => qualifySealedGraphifyBindingsV1({ ...base, sources: [source, source], bindingRows: [binding] }))
      .toThrow('SEALED_GRAPHIFY_BINDING_EXPECTED_REF_DUPLICATE_OR_EMPTY');
    expect(() => qualifySealedGraphifyBindingsV1({ ...base, sources: [{ ...source, sourceRevision: 'sha256:bad' }], bindingRows: [binding] }))
      .toThrow('SEALED_GRAPHIFY_BINDING_EXPECTED_REVISION_INVALID');
  });
});
