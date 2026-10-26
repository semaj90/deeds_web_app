// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  workspaceRevisionRecordV1Schema,
} from './workspace-source-binding-v1.js';

const ADMITTED = 'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c';
const HEX40 = 'a'.repeat(40);
const DIGEST_A = 'b'.repeat(64);

const entries = [
  { sourceRef: 'src/a.ts', sourceRevision: `sha256:${DIGEST_A}`, contentDigest: DIGEST_A, byteLength: 10, gitBlobOid: HEX40 },
  { sourceRef: 'src/b.ts', sourceRevision: `sha256:${'c'.repeat(64)}`, contentDigest: 'c'.repeat(64), byteLength: 20, gitBlobOid: null },
];

function baseRecord() {
  return buildWorkspaceRevisionRecordV1({
    repositoryId: 'deeds-web-app',
    gitObjectFormat: 'sha1',
    baseCommitOid: HEX40,
    baseTreeOid: HEX40,
    gitHeadRef: 'main',
    dirty: false,
    entries,
    generatedAt: '2026-10-25T00:00:00.000Z',
    producerRevision: 'test.producer.v1',
  }).record;
}

describe('workspace revision basis', () => {
  it('keeps the manifest-digest rule as the default', () => {
    const record = baseRecord();
    expect(record.workspaceRevisionBasis).toBe('SOURCE_MANIFEST_DIGEST');
    expect(record.workspaceRevision).toBe(`sha256:${record.sourceManifestDigest}`);
  });

  it('accepts an admitted derivation revision when the basis says so', () => {
    const parsed = workspaceRevisionRecordV1Schema.parse({
      ...baseRecord(),
      workspaceRevision: ADMITTED,
      workspaceRevisionBasis: 'ADMITTED_DERIVATION',
    });
    expect(parsed.workspaceRevision).toBe(ADMITTED);
  });

  it('still rejects a non-manifest revision under the default basis', () => {
    expect(() => workspaceRevisionRecordV1Schema.parse({ ...baseRecord(), workspaceRevision: ADMITTED })).toThrow();
  });
});

describe('binding builder keyed by the admitted derivation revision', () => {
  it('emits every binding under the admitted revision with the manifest checksum still enforced', () => {
    const record = baseRecord();
    const bindings = buildWorkspaceSourceBindingsV1({
      record: { ...record, workspaceRevision: ADMITTED, workspaceRevisionBasis: 'ADMITTED_DERIVATION' },
      entries,
      trackedAtBaseCommit: new Map([['src/a.ts', true]]),
      dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]),
      producerRevision: 'test.producer.v1',
    });
    expect(bindings).toHaveLength(2);
    for (const binding of bindings) {
      expect(binding.workspaceRevision).toBe(ADMITTED);
      expect(binding.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(bindings[0].gitBlobOid).toBe(HEX40);
    expect(bindings[1].gitBlobOid).toBeNull();
  });
});
