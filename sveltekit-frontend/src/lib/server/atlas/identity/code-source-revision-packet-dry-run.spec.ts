import { describe, expect, it } from 'vitest';
import { dryRunCodeSourceRevisionPacket } from './code-source-revision-packet-dry-run.js';
import { deriveCodeSourceRevisionV1 } from './code-source-revision-v1.js';

const sourceContent = 'export const foo = 1;';
const digest = deriveCodeSourceRevisionV1(sourceContent).contentDigest;

describe('code source revision packet dry-run', () => {
  it('produces a revision-qualified packet without writes', () => {
    const result = dryRunCodeSourceRevisionPacket({
      packetKey: 'packet:dry-run', sourceRef: 'src/dry-run.ts', sourceContent,
      workspaceRevision: 'workspace:1', representationId: 'semantic_768',
      representationRevision: 1, existingPacketSha256: digest,
    });
    expect(result.status).toBe('READY_FOR_PERSISTENCE_REVIEW');
    expect(result.canonicalWrites).toBe(false);
    expect(result.existingDigestMatch).toBe(true);
    expect(result.revision?.sourceRevision).toBe(`sha256:${digest}`);
  });

  it('blocks digest mismatches instead of overwriting packet identity', () => {
    const result = dryRunCodeSourceRevisionPacket({
      packetKey: 'packet:dry-run', sourceRef: 'src/dry-run.ts', sourceContent,
      workspaceRevision: 'workspace:1', representationId: 'semantic_768',
      representationRevision: 1, existingPacketSha256: 'f'.repeat(64),
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('EXISTING_PACKET_DIGEST_MISMATCH');
  });

  it('blocks missing workspace or source content', () => {
    const result = dryRunCodeSourceRevisionPacket({
      packetKey: 'packet:dry-run', sourceRef: 'src/dry-run.ts', sourceContent: '',
      workspaceRevision: '', representationId: 'semantic_768', representationRevision: 1,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toEqual(expect.arrayContaining(['MISSING_WORKSPACE_REVISION', 'SOURCE_CONTENT_UNAVAILABLE']));
  });
});
