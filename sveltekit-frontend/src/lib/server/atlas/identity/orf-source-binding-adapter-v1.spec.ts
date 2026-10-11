// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AdmittedSourceRevisionError, validateAdmittedSourceRevisionRowV1 } from './admitted-source-revision-resolver-v1.js';
import { inspectOrfSourceBindingV1, OrfSourceBindingErrorV1 } from './orf-source-binding-adapter-v1.js';

const digest = 'a'.repeat(64);
const workspaceRevision = `sha256:${'b'.repeat(64)}`;
const sourceRevision = `sha256:${digest}`;
const request = { packetKey: 'packet:1', sourceRef: 'src/auth.ts', sourceRevision, workspaceRevision };
const row = {
  repo_id: 'deeds-web-app', canonical_source_ref: 'src/auth.ts', workspace_revision: workspaceRevision,
  source_revision: sourceRevision, content_digest: digest, binding_checksum: 'c'.repeat(64),
};
// Dependency-injected resolver backed by the REAL row validator (the DB query itself is not exercised here).
const resolverFor = (rows: typeof row[]) => async (input: { sourceRef: string; workspaceRevision: string }) => {
  const matches = rows.filter((r) => r.canonical_source_ref === input.sourceRef && r.workspace_revision === input.workspaceRevision);
  if (matches.length === 0) throw new AdmittedSourceRevisionError('SOURCE_BINDING_NOT_FOUND');
  if (matches.length > 1) throw new AdmittedSourceRevisionError('SOURCE_BINDING_AMBIGUOUS');
  return validateAdmittedSourceRevisionRowV1(matches[0], input);
};
const code = async (p: Promise<unknown>) => p.then(() => 'RESOLVED', (e) => (e instanceof OrfSourceBindingErrorV1 ? e.code : `OTHER:${String(e)}`));

describe('inspectOrfSourceBindingV1 (read-only binding readback, not a receipt)', () => {
  it('exact match returns a non-authoritative readback that never claims receipt, approval or admission', async () => {
    const out = await inspectOrfSourceBindingV1(request, resolverFor([row]));
    expect(out).toMatchObject({
      status: 'SOURCE_BINDING_MATCH_READ_ONLY', packetKey: 'packet:1', sourceRevision, workspaceRevision,
      sourceVersionReceiptVerified: false, registryApprovalVerified: false, canonicalAuthority: false, admissionAuthorized: false, writesPerformed: false,
    });
  });

  it('rejects malformed requests before resolving', async () => {
    const neverCalled = async () => { throw new Error('must not resolve'); };
    expect(await code(inspectOrfSourceBindingV1({ ...request, packetKey: ' ' }, neverCalled as never))).toBe('ORF_SOURCE_BINDING_REQUEST_INVALID');
    expect(await code(inspectOrfSourceBindingV1({ ...request, sourceRevision: 'abc' }, neverCalled as never))).toBe('ORF_SOURCE_BINDING_REQUEST_INVALID');
    expect(await code(inspectOrfSourceBindingV1({ ...request, workspaceRevision: 'ws' }, neverCalled as never))).toBe('ORF_SOURCE_BINDING_REQUEST_INVALID');
  });

  it('absent and ambiguous bindings are UNRESOLVED (fail closed)', async () => {
    expect(await code(inspectOrfSourceBindingV1(request, resolverFor([])))).toBe('ORF_SOURCE_BINDING_UNRESOLVED');
    expect(await code(inspectOrfSourceBindingV1(request, resolverFor([row, { ...row, repo_id: 'other' }])))).toBe('ORF_SOURCE_BINDING_UNRESOLVED');
  });

  it('a plan row whose source revision differs from the binding is a MISMATCH (stale source revision)', async () => {
    const other = `sha256:${'d'.repeat(64)}`;
    expect(await code(inspectOrfSourceBindingV1({ ...request, sourceRevision: other }, resolverFor([row])))).toBe('ORF_SOURCE_BINDING_MISMATCH');
  });

  it('a stale workspace revision finds no binding for that workspace', async () => {
    expect(await code(inspectOrfSourceBindingV1({ ...request, workspaceRevision: `sha256:${'9'.repeat(64)}` }, resolverFor([row])))).toBe('ORF_SOURCE_BINDING_UNRESOLVED');
  });

  it('an invalid binding checksum or digest/revision contradiction never resolves', async () => {
    expect(await code(inspectOrfSourceBindingV1(request, resolverFor([{ ...row, binding_checksum: 'not-a-checksum' }])))).toBe('ORF_SOURCE_BINDING_UNRESOLVED');
    expect(await code(inspectOrfSourceBindingV1(request, resolverFor([{ ...row, content_digest: 'e'.repeat(64) }])))).toBe('ORF_SOURCE_BINDING_UNRESOLVED');
  });

  it('packetKey is correlated, not verified: an arbitrary packet key still gets only a non-authoritative readback', async () => {
    const out = await inspectOrfSourceBindingV1({ ...request, packetKey: 'packet:not-checked-here' }, resolverFor([row]));
    expect(out.admissionAuthorized).toBe(false);
    expect(out.packetKey).toBe('packet:not-checked-here');
  });
});
