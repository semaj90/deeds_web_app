import { describe, expect, it } from 'vitest';
import { buildFeaturePacketV1, FeaturePacketV1Schema } from './feature-packet-v1.js';

const base = {
  schema: 'atlas.feature-packet.v1' as const,
  packetKey: 'packet:parent-atlas-001',
  sourceRef: 'src/example.ts',
  sourceRevision: 'sha256:source-bytes-001',
  workspaceRevision: 'sha256:workspace-001',
  producerRevision: 'feature-builder@abc123',
  featureRevision: 'feature-schema@v1',
  topicEvidence: [{ label: 'compiler', evidenceRefs: ['span:4', 'span:2', 'span:4'] }],
  domainEvidence: [{ label: 'database', evidenceRefs: ['source:db'] }],
  languageEvidence: [{ label: 'typescript', labelNamespace: 'AST_PARSER_LANGUAGE', sourceOwner: 'ast-schema', sourceRevision: 'ddl:r1', evidenceRefs: ['ast-node:1'] }],
  featurePacket: {
    schemaId: 'atlas:domain:features' as const,
    schemaVersion: '1.0.0' as const,
    packetKey: 'packet:parent-atlas-001',
    featureSchemaVersion: 'feature-schema@v1',
    lexical: { tokens: ['compiler'] },
    provenance: {
      sourceContentSha256: 'a'.repeat(64),
      parserVersion: 'tree-sitter@1',
      featureMaterializationTime: '2026-09-23T00:00:00.000Z',
    },
  },
  canonicalAuthority: false as const,
  writesPerformed: false as const,
  promotionAuthorized: false as const,
};

describe('FeaturePacketV1', () => {
  it('creates a deterministic checksum over revision-qualified grounded evidence', () => {
    const first = buildFeaturePacketV1(base);
    const second = buildFeaturePacketV1({
      ...base,
      topicEvidence: [{ label: 'compiler', evidenceRefs: ['span:4', 'span:2'] }],
    });
    expect(first.checksum).toBe(second.checksum);
    expect(first.topicEvidence[0]?.evidenceRefs).toEqual(['span:2', 'span:4']);
    expect(FeaturePacketV1Schema.safeParse(first).success).toBe(true);
  });

  it('changes the receipt checksum when a source or producer revision changes', () => {
    const first = buildFeaturePacketV1(base);
    expect(buildFeaturePacketV1({ ...base, sourceRevision: 'sha256:source-bytes-002' }).checksum).not.toBe(first.checksum);
    expect(buildFeaturePacketV1({ ...base, producerRevision: 'feature-builder@def456' }).checksum).not.toBe(first.checksum);
  });

  it('rejects mismatched packet keys and tampered checksums without granting authority', () => {
    expect(() => buildFeaturePacketV1({
      ...base,
      featurePacket: { ...base.featurePacket, packetKey: 'packet:different-002' },
    })).toThrow();
    const built = buildFeaturePacketV1(base);
    expect(FeaturePacketV1Schema.safeParse({ ...built, sourceRevision: 'sha256:tampered' }).success).toBe(false);
    expect(built.canonicalAuthority).toBe(false);
    expect(built.writesPerformed).toBe(false);
    expect(built.promotionAuthorized).toBe(false);
  });

  it('rejects an envelope whose feature revision disagrees with the nested payload revision', () => {
    expect(() => buildFeaturePacketV1({
      ...base,
      featureRevision: 'feature-schema@v2',
    })).toThrow();
  });
});
