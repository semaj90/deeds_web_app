import { describe, expect, it } from 'vitest';
import { buildSourceNamespaceFromGraphifyFilesV1, SourceNamespaceV1Schema } from './source-namespace-v1.js';

const WS_ID = '625743d2-092b-4fa8-abe0-9dc094920c80';

describe('SOURCE-NAMESPACE-CONTRACT-01', () => {
  it('produces WORKSPACE_IDENTITY_ONLY when workspaceRevision is null (the majority real case)', () => {
    const ns = buildSourceNamespaceFromGraphifyFilesV1({
      workspaceId: WS_ID,
      repositoryId: 'deeds-web-app',
      workspaceRevision: null,
    });
    expect(ns.provenance).toBe('WORKSPACE_IDENTITY_ONLY');
    expect(ns.bindingRevision).toBeUndefined();
  });

  it('produces REVISION_BOUND when a real workspaceRevision is present', () => {
    const ns = buildSourceNamespaceFromGraphifyFilesV1({
      workspaceId: WS_ID,
      repositoryId: 'deeds-web-app',
      workspaceRevision: 'sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc',
    });
    expect(ns.provenance).toBe('REVISION_BOUND');
    expect(ns.bindingRevision).toBe('sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc');
  });

  it('schema rejects REVISION_BOUND without a bindingRevision (superRefine)', () => {
    const result = SourceNamespaceV1Schema.safeParse({
      schema: 'atlas.source-namespace.v1',
      workspaceId: WS_ID,
      repositoryId: 'deeds-web-app',
      resolvedFrom: 'graphify_files',
      provenance: 'REVISION_BOUND',
    });
    expect(result.success).toBe(false);
  });

  it('schema rejects WORKSPACE_IDENTITY_ONLY carrying a bindingRevision (no silent upgrade)', () => {
    const result = SourceNamespaceV1Schema.safeParse({
      schema: 'atlas.source-namespace.v1',
      workspaceId: WS_ID,
      repositoryId: 'deeds-web-app',
      bindingRevision: 'sha256:aaaa',
      resolvedFrom: 'graphify_files',
      provenance: 'WORKSPACE_IDENTITY_ONLY',
    });
    expect(result.success).toBe(false);
  });
});
