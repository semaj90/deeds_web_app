import { describe, expect, it } from 'vitest';
import { evaluateCodeRevisionAuthority } from './code-revision-authority-v1.js';

const hash = 'a'.repeat(64);

describe('CodeRevisionAuthorityV1', () => {
  it('proves compatibility without binding a durable owner', () => {
    const result = evaluateCodeRevisionAuthority({
      sourcePath: 'src/example.ts',
      workspaceRevision: 'workspace:main',
      legacySourceRevision: '0123456789abcdef0123456789abcdef01234567',
      contentHash: hash,
      expectedContentHash: hash,
      authorityColumn: 'content_hash',
    });
    expect(result.status).toBe('REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND');
    expect(result.sourceRevisionAuthorityColumn).toBe('content_hash');
    expect(result.preservesLegacySourceRevisionSemantics).toBe(true);
    expect(result.durableOwnerBound).toBe(false);
    expect(result.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('rejects a content hash mismatch', () => {
    const result = evaluateCodeRevisionAuthority({
      sourcePath: 'src/example.ts',
      workspaceRevision: 'workspace:main',
      legacySourceRevision: '0123456789abcdef0123456789abcdef01234567',
      contentHash: hash,
      expectedContentHash: 'b'.repeat(64),
      authorityColumn: 'content_hash',
    });
    expect(result.status).toBe('REVISION_ORIGIN_NOT_PROVEN');
    expect(result.exactByteDigestMatches).toBe(false);
  });

  it('rejects missing source path or invalid legacy Git provenance', () => {
    const result = evaluateCodeRevisionAuthority({
      sourcePath: null,
      workspaceRevision: 'workspace:main',
      legacySourceRevision: 'content:derived-anchor',
      contentHash: hash,
      expectedContentHash: hash,
      authorityColumn: 'content_hash',
    });
    expect(result.status).toBe('REVISION_ORIGIN_NOT_PROVEN');
    expect(result.legacyGitProvenanceValid).toBe(false);
    expect(result.fanoutMayConsumeAsCanonical).toBe(false);
  });
});
