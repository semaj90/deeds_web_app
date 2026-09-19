import { describe, expect, it } from 'vitest';
import { derivePacketRevisionV1 } from './packet-revision-v1.js';

const base = {
  packetKey: 'packet:example',
  sourceRef: 'src/example.ts',
  sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  contentDigest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  packetSchemaRevision: 'atlas-packet-schema-v1',
} as const;

describe('derivePacketRevisionV1', () => {
  const deriveFromCanonicalFields = (value: typeof base & Record<string, unknown>) => derivePacketRevisionV1({
    packetKey: value.packetKey,
    sourceRef: value.sourceRef,
    sourceRevision: value.sourceRevision,
    contentDigest: value.contentDigest,
    packetSchemaRevision: value.packetSchemaRevision,
  });

  it('derives a stable noncanonical revision from packet/source content state', () => {
    const first = derivePacketRevisionV1(base);
    const second = derivePacketRevisionV1({ ...base });

    expect(first).toEqual(second);
    expect(first.packetRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
  });

  it.each(['workspaceRevision', 'representationRevision', 'embeddingDigest', 'executionId'])(
    'does not accept excluded metadata as a derivation input: %s',
    (field) => {
      const withExcludedMetadata = { ...base, [field]: 'must-not-participate' };
      expect(deriveFromCanonicalFields(withExcludedMetadata)).toEqual(derivePacketRevisionV1(base));
    },
  );

  it.each(['sourceRevision', 'contentDigest', 'packetKey', 'packetSchemaRevision'])(
    'changes when canonical input changes: %s',
    (field) => {
      const changed = { ...base, [field]: field === 'sourceRevision'
        ? 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        : field === 'contentDigest'
          ? 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
          : `${base[field as keyof typeof base]}-changed` };
      expect(derivePacketRevisionV1(changed).packetRevision).not.toBe(derivePacketRevisionV1(base).packetRevision);
    },
  );

  it.each([
    ['packetKey', ''],
    ['sourceRef', ''],
    ['sourceRevision', null],
    ['contentDigest', null],
    ['packetSchemaRevision', '   '],
  ])('fails closed for unqualified input: %s', (field, value) => {
    const invalid = { ...base, [field]: value };
    expect(() => derivePacketRevisionV1(invalid as typeof base)).toThrow();
  });
});
