import { describe, expect, it } from 'vitest';
import { verifyEdgeArtifact } from './phase23-artifact-integrity.js';
describe('Phase23 artifact integrity', () => {
  it('does not admit files without pinned digest', async () => {
    const data = new TextEncoder().encode('test');
    expect((await verifyEdgeArtifact(data.buffer)).verdict).toBe('NOT_PROVEN');
  });
  it('detects mismatched digests if WebCrypto is available', async () => {
    const data = new TextEncoder().encode('test');
    const r = await verifyEdgeArtifact(data.buffer, '0'.repeat(64));
    expect(['FAIL', 'NOT_PROVEN']).toContain(r.verdict);
    expect(r.verdict).not.toBe('PASS');
  });
});
