import { describe, expect, it } from 'vitest';
import { preflightSourceAuthorityShadowV1, type SourceAuthorityCandidateV1, type VerifiedSourceAuthorityV1 } from './source-authority-shadow-preflight-v1.js';

const hash = 'a'.repeat(64);
const candidate: SourceAuthorityCandidateV1 = {
  chunkRowId: 'chunk-1', packetKey: 'packet-1', sourceRef: 'src/example.ts',
  sourceRevision: 'source-v1', workspaceRevision: 'workspace-v1',
};
const verified: VerifiedSourceAuthorityV1 = {
  ...candidate, sourceBindingReceiptChecksum: hash, sourceFileSha256: hash,
  verifiedBytesSha256: 'sha256:' + hash, authorityProducerRevision: 'producer-v1',
  sourceReceiptVerified: true,
};
const run = (overrides: Record<string, unknown> = {}) =>
  preflightSourceAuthorityShadowV1({
    requestId: 'request-1', candidateSnapshotChecksum: hash,
    candidates: [candidate], resolveVerifiedSource: async () => verified,
    ...overrides,
  } as Parameters<typeof preflightSourceAuthorityShadowV1>[0]);

describe('source authority shadow preflight', () => {
  it('binds a verified receipt to exact request and snapshot, without granting authority', async () => {
    const result = await run();
    expect(result.status).toBe('VERIFIED_SHADOW');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    if (result.status === 'VERIFIED_SHADOW') expect(result.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('blocks absent source authority', async () => {
    const result = await run({ resolveVerifiedSource: async () => null });
    expect(result.status).toBe('BLOCKED');
    if (result.status === 'BLOCKED') expect(result.reason).toBe('SOURCE_AUTHORITY_UNAVAILABLE');
  });
  it('blocks stale workspace identity', async () => {
    const result = await run({ resolveVerifiedSource: async () => ({ ...verified, workspaceRevision: 'old' }) });
    expect(result.status).toBe('BLOCKED');
    if (result.status === 'BLOCKED') expect(result.reason).toBe('SOURCE_AUTHORITY_IDENTITY_MISMATCH');
  });
  it('blocks byte digest mismatch', async () => {
    const result = await run({ resolveVerifiedSource: async () => ({ ...verified, verifiedBytesSha256: 'b'.repeat(64) }) });
    expect(result.status).toBe('BLOCKED');
    if (result.status === 'BLOCKED') expect(result.reason).toBe('SOURCE_AUTHORITY_RECEIPT_INVALID');
  });
  it('blocks missing source-verification receipt', async () => {
    const result = await run({ resolveVerifiedSource: async () => ({ ...verified, sourceReceiptVerified: false }) });
    expect(result.status).toBe('BLOCKED');
  });
  it('blocks invalid candidate snapshot checksum', async () => {
    const result = await run({ candidateSnapshotChecksum: 'worktree-v1' });
    expect(result.status).toBe('BLOCKED');
  });
  it('blocks duplicate candidate membership', async () => {
    const result = await run({ candidates: [candidate, candidate] });
    expect(result.status).toBe('BLOCKED');
  });
  it('blocks provider exceptions', async () => {
    const result = await run({ resolveVerifiedSource: async () => { throw new Error('unavailable'); } });
    expect(result.status).toBe('BLOCKED');
  });
});
