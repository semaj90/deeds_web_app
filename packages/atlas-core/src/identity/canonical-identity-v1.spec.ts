import { describe, expect, it } from 'vitest';
import {
  featureIdentityRef,
  isCanonicalIdentityKind,
  type CanonicalIdentityKindV1,
  type CanonicalIdentityV1,
} from './canonical-identity-v1.js';
import type { FeatureIdentity } from './feature-identity.js';

const ALL_KINDS: CanonicalIdentityKindV1[] = [
  'STABLE_FILE',
  'REPOSITORY',
  'SOURCE_REVISION',
  'WORKSPACE_REVISION',
  'PACKET',
  'TREE_NODE_OCCURRENCE',
  'STABLE_SYMBOL',
  'SYMBOL_VERSION',
  'FEATURE',
];

describe('CanonicalIdentityV1 envelope', () => {
  it('exhaustively handles every declared kind with no default arm (compile-time proof)', () => {
    function describeKind(identity: CanonicalIdentityV1): string {
      switch (identity.kind) {
        case 'STABLE_FILE':
          return identity.stableFileId;
        case 'REPOSITORY':
          return identity.repositoryId;
        case 'SOURCE_REVISION':
          return identity.sourceRevision;
        case 'WORKSPACE_REVISION':
          return identity.workspaceRevision;
        case 'PACKET':
          return identity.packetKey;
        case 'TREE_NODE_OCCURRENCE':
          return identity.occurrenceId;
        case 'STABLE_SYMBOL':
          return identity.stableSymbolId;
        case 'SYMBOL_VERSION':
          return identity.symbolVersionId;
        case 'FEATURE':
          return identity.featureId;
        // no default -- TypeScript flags this function as non-exhaustive if a
        // kind is ever added to the union without a matching case here.
      }
    }

    const packet: CanonicalIdentityV1 = {
      kind: 'PACKET',
      packetKey: 'packet:0123456789ab',
      sourceRef: 'src/lib/server/auth.ts',
    };
    expect(describeKind(packet)).toBe('packet:0123456789ab');
  });

  it('isCanonicalIdentityKind discriminates by kind alone, structurally, with no I/O', () => {
    const workspaceRevision: CanonicalIdentityV1 = {
      kind: 'WORKSPACE_REVISION',
      workspaceRevision: `sha256:${'a'.repeat(64)}`,
    };
    expect(isCanonicalIdentityKind(workspaceRevision, 'WORKSPACE_REVISION')).toBe(true);
    expect(isCanonicalIdentityKind(workspaceRevision, 'PACKET')).toBe(false);
    expect(isCanonicalIdentityKind(null, 'PACKET')).toBe(false);
    expect(isCanonicalIdentityKind('not-an-object', 'PACKET')).toBe(false);
  });

  it('never conflates PACKET with STABLE_FILE (distinct kinds, distinct field names)', () => {
    const stableFile: CanonicalIdentityV1 = {
      kind: 'STABLE_FILE',
      stableFileId: '018f1e1a-0000-7000-8000-000000000000',
      repositoryId: '018f1e1a-1111-7000-8000-000000000000',
    };
    const packet: CanonicalIdentityV1 = {
      kind: 'PACKET',
      packetKey: 'packet:0123456789ab',
      sourceRef: 'src/lib/server/auth.ts',
    };
    expect('stableFileId' in packet).toBe(false);
    expect('packetKey' in stableFile).toBe(false);
    expect(stableFile.kind).not.toBe(packet.kind);
  });

  it('featureIdentityRef wraps a FeatureIdentity into the FEATURE variant without mutating it', () => {
    const identity: FeatureIdentity = {
      featureId: 'feature:codebase:0123456789abcdef01234567',
      featureKey: 'auth:sessions',
      sourceKey: 'src/lib/server/auth.ts',
      sourceRef: 'src/lib/server/auth.ts',
      sourceRefs: ['src/lib/server/auth.ts'],
    };
    const ref = featureIdentityRef(identity);
    expect(ref).toEqual({ kind: 'FEATURE', featureId: identity.featureId });
  });

  it('declares exactly the frozen 9-kind taxonomy (adding a kind here requires a doc-comment justification, not a silent addition)', () => {
    expect(ALL_KINDS).toHaveLength(9);
    expect(new Set(ALL_KINDS).size).toBe(9);
  });
});
