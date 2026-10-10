import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSourceAuthorityBindingAdapterV1 } from './source-authority-binding-adapter-v1.js';

const text = 'export const approved = true;\n';
const sha = 'sha256:' + createHash('sha256').update(text).digest('hex');
const candidate = {
  chunkRowId: 'chunk-1', packetKey: 'packet-1', sourceRef: 'src/example.ts',
  sourceRevision: sha, workspaceRevision: 'workspace-1',
};
const checksum = 'a'.repeat(64);
const binding = {
  status: 'VERIFIED_SOURCE_BINDING' as const,
  canonicalPacketKey: candidate.packetKey, storagePacketKey: candidate.packetKey,
  sourceRef: candidate.sourceRef, sourceRevision: sha,
  workspaceRevision: candidate.workspaceRevision, submittedTextChecksum: sha,
  sourceBindingChecksum: checksum, checksum,
  canonicalAuthority: false as const, writesPerformed: false as const,
};
const make = (options: {
  text?: string | null;
  fileDigest?: string;
  receipt?: typeof binding;
  producerRevision?: string;
} = {}) => createSourceAuthorityBindingAdapterV1({
  readSourceText: async () => options.text === undefined ? text : options.text,
  readFileDigest: async () => ({
    file_found: true,
    file_sha256: options.fileDigest ?? sha,
    file_byte_length: Buffer.byteLength(options.text ?? text),
  }),
  resolveSourceBinding: async () => options.receipt ?? binding,
  authorityProducerRevision: options.producerRevision ?? 'source-owner-v1',
});
describe('source authority binding adapter', () => {
  it('passes only a matching byte digest and canonical binding into a shadow receipt', async () => {
    const result = await make().preflight({
      requestId: 'request-1', candidateSnapshotChecksum: checksum, candidates: [candidate],
    });
    expect(result.status).toBe('VERIFIED_SHADOW');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });
  it('blocks unqualified workspace bytes', async () => {
    expect(await make({ text: 'changed' }).resolveVerifiedSource(candidate)).toBeNull();
  });
  it('blocks source digest mismatch', async () => {
    expect(await make({ fileDigest: 'b'.repeat(64) }).resolveVerifiedSource(candidate)).toBeNull();
  });
  it('blocks packet resolution mismatch', async () => {
    expect(await make({ receipt: { ...binding, canonicalPacketKey: 'other' } }).resolveVerifiedSource(candidate)).toBeNull();
  });
  it('blocks wrong workspace', async () => {
    expect(await make({ receipt: { ...binding, workspaceRevision: 'old' } }).resolveVerifiedSource(candidate)).toBeNull();
  });
  it('blocks missing producer revision', async () => {
    expect(await make({ producerRevision: '' }).resolveVerifiedSource(candidate)).toBeNull();
  });
});
