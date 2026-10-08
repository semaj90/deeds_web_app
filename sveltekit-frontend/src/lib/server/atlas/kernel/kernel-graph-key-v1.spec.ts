import { describe, expect, it } from 'vitest';
import {
  buildKernelGraphEvidenceKeyV1,
  buildKernelGraphLookupKeyV1,
  KernelGraphKeyV1Schema,
} from './kernel-graph-key-v1.js';

const sourceRevision = `sha256:${'a'.repeat(64)}`;
const workspaceRevisionKey = `sha256:${'b'.repeat(64)}`;

describe('KernelGraphKeyV1', () => {
  it('builds a partial file lookup key for diagnostics without claiming authority', () => {
    expect(buildKernelGraphLookupKeyV1({
      projectionKind: 'FILE',
      canonicalSourceRef: 'src/feature.ts',
    })).toEqual({
      schema: 'atlas.kernel-graph-key.v1',
      qualification: 'LOOKUP',
      projectionKind: 'FILE',
      canonicalSourceRef: 'src/feature.ts',
      canonicalAuthority: false,
    });
  });

  it('builds a revision-qualified symbol evidence key from resolved identity', () => {
    const key = buildKernelGraphEvidenceKeyV1({
      projectionKind: 'SYMBOL',
      canonicalSourceRef: 'src/feature.ts',
      symbolVersionId: 'symbol-version:123',
      workspaceRevisionKey,
      sourceRevision,
      graphRevision: 'graph:sha256:revision-1',
    });

    expect(KernelGraphKeyV1Schema.parse(key)).toEqual(key);
    expect(key.canonicalAuthority).toBe(false);
  });

  it.each(['PACKET', 'INCIDENCE'] as const)('%s keys require a packet key', (projectionKind) => {
    expect(() => buildKernelGraphLookupKeyV1({
      projectionKind,
      canonicalSourceRef: 'src/feature.ts',
    } as Parameters<typeof buildKernelGraphLookupKeyV1>[0])).toThrow();
  });

  it('requires a resolved symbol version for symbol keys', () => {
    expect(() => buildKernelGraphLookupKeyV1({
      projectionKind: 'SYMBOL',
      canonicalSourceRef: 'src/feature.ts',
    } as Parameters<typeof buildKernelGraphLookupKeyV1>[0])).toThrow();
  });

  it('rejects unqualified evidence keys', () => {
    expect(() => buildKernelGraphEvidenceKeyV1({
      projectionKind: 'FILE',
      canonicalSourceRef: 'src/feature.ts',
      workspaceRevisionKey,
      sourceRevision,
      graphRevision: '',
    })).toThrow();
  });

  it.each([
    'C:/repo/src/feature.ts',
    'file:///C:/repo/src/feature.ts',
    '../src/feature.ts',
    'src\\feature.ts',
  ])('rejects non-canonical source refs: %s', (canonicalSourceRef) => {
    expect(() => buildKernelGraphLookupKeyV1({
      projectionKind: 'FILE',
      canonicalSourceRef,
    })).toThrow();
  });

  it('rejects projection-specific identity fields it does not understand', () => {
    expect(() => KernelGraphKeyV1Schema.parse({
      schema: 'atlas.kernel-graph-key.v1',
      qualification: 'LOOKUP',
      projectionKind: 'FILE',
      canonicalSourceRef: 'src/feature.ts',
      neo4jNodeId: 'node:private',
      canonicalAuthority: false,
    })).toThrow();
  });
});
