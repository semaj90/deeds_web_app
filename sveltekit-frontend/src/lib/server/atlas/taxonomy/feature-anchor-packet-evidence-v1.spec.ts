import { describe, expect, it } from 'vitest';
import { buildFeatureAnchorPacketEvidenceV1 } from './feature-anchor-packet-evidence-v1.js';

const loginSourceRef = 'src/routes/login/+page.svelte';
const loginSha256 = 'a'.repeat(64);
const workspaceRevision = `sha256:${'c'.repeat(64)}`;

describe('FeatureAnchorPacketEvidenceV1', () => {
  it('returns a candidate only when local bytes, packet revision, and admitted workspace binding agree', () => {
    const result = buildFeatureAnchorPacketEvidenceV1({
      featureLabel: 'auth',
      sourceSha256ByRef: {
        [loginSourceRef]: loginSha256,
        'src/lib/server/lucia.ts': null,
      },
      packetRows: [{
        packetKey: 'packet:auth-login',
        sourceRef: `sveltekit-frontend/${loginSourceRef}`,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevisionKey: workspaceRevision,
      }],
      workspaceBindings: [{
        canonicalSourceRef: `sveltekit-frontend/${loginSourceRef}`,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevision,
        contentDigest: loginSha256,
      }],
    });

    expect(result.status).toBe('CANDIDATES_FOUND');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      packetKey: 'packet:auth-login',
      sourceRevision: `sha256:${loginSha256}`,
      workspaceBinding: {
        canonicalSourceRef: `sveltekit-frontend/${loginSourceRef}`,
        workspaceRevision,
        contentDigest: loginSha256,
      },
      qualification: 'SOURCE_BYTES_AND_WORKSPACE_BINDING_MATCH_NOT_ADMITTED',
    });
    expect(result.rejections).toContainEqual({
      sourceRef: 'src/lib/server/lucia.ts',
      reason: 'LOCAL_SOURCE_UNAVAILABLE',
    });
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects stale, missing-identity, and duplicate matching packet rows', () => {
    const base = {
      featureLabel: 'auth' as const,
      sourceSha256ByRef: {
        [loginSourceRef]: loginSha256,
        'src/lib/server/lucia.ts': null,
      },
      workspaceBindings: [],
    };
    const stale = buildFeatureAnchorPacketEvidenceV1({
      ...base,
      packetRows: [{
        packetKey: 'packet:stale',
        sourceRef: loginSourceRef,
        sourceRevision: `sha256:${'b'.repeat(64)}`,
        workspaceRevisionKey: 'workspace-r1',
      }],
    });
    expect(stale.rejections[0]?.reason).toBe('SOURCE_REVISION_MISMATCH');

    const incomplete = buildFeatureAnchorPacketEvidenceV1({
      ...base,
      packetRows: [{
        packetKey: null,
        sourceRef: loginSourceRef,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevisionKey: null,
      }],
    });
    expect(incomplete.rejections[0]?.reason).toBe('PACKET_IDENTITY_INCOMPLETE');

    const duplicate = buildFeatureAnchorPacketEvidenceV1({
      ...base,
      packetRows: [1, 2].map((index) => ({
        packetKey: `packet:duplicate-${index}`,
        sourceRef: loginSourceRef,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevisionKey: 'workspace-r1',
      })),
    });
    expect(duplicate.rejections[0]?.reason).toBe('MULTIPLE_MATCHING_PACKETS');
    expect(duplicate.candidates).toHaveLength(0);
  });

  it('rejects a packet with matching bytes when its workspace binding is missing or mismatched', () => {
    const result = buildFeatureAnchorPacketEvidenceV1({
      featureLabel: 'auth',
      sourceSha256ByRef: { [loginSourceRef]: loginSha256, 'src/lib/server/lucia.ts': null },
      packetRows: [{
        packetKey: 'packet:auth-login',
        sourceRef: `sveltekit-frontend/${loginSourceRef}`,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevisionKey: workspaceRevision,
      }],
      workspaceBindings: [{
        canonicalSourceRef: `sveltekit-frontend/${loginSourceRef}`,
        sourceRevision: `sha256:${loginSha256}`,
        workspaceRevision: `sha256:${'d'.repeat(64)}`,
        contentDigest: loginSha256,
      }],
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejections).toContainEqual({
      sourceRef: loginSourceRef,
      reason: 'WORKSPACE_BINDING_MISMATCH',
    });
  });
});
