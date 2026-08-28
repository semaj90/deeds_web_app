import { describe, expect, it } from 'vitest';
import { fileObservationPacketChecksumV1, fileObservationPacketV1Schema } from './file-observation-packet-v1.js';

const packet = {
  schema: 'atlas.file-observation-packet.v1' as const,
  packetKey: 'packet:1', sourceRef: 'src/example.ts', sourceRevision: 'sha256:' + 'a'.repeat(64),
  workspaceRevision: 'sha256:' + 'b'.repeat(64), language: 'typescript', byteLength: 42, lineCount: 3,
  parserRevision: 'treesitter-chunker:4.0.0', grammarRevision: 'typescript:0.23.2', cstDigest: 'c'.repeat(64),
  treeNodeIds: ['node:1'], symbols: ['parse'], imports: ['zod'], exports: ['parse'], calls: ['hash'],
  identifiers: ['parse'], exactTerms: ['sourceRevision'], apiNames: [], frameworkNames: ['sveltekit'],
  configKeys: [], envVars: [], routes: [], sqlTables: [], errorCodes: [], testNames: [],
  astObservations: ['FUNCTION_DECL'], ontologyClasses: [], domainClasses: ['CODE'], metadata: { kind: 'source' },
  evidenceRefs: [{ ref: 'ast:1', kind: 'AST' as const, span: { startByte: 0, endByte: 10 }, sourceRevision: 'sha256:' + 'a'.repeat(64), producerRevision: 'ast:v1' }],
  contentDigest: 'd'.repeat(64), producerRevision: 'observation:v1', canonicalAuthority: false as const,
};

describe('FileObservationPacketV1', () => {
  it('accepts a revision-qualified evidence-only packet', () => {
    expect(fileObservationPacketV1Schema.parse(packet).canonicalAuthority).toBe(false);
  });

  it('produces the same checksum when object key order changes', () => {
    const reordered = { ...packet, metadata: { kind: 'source' }, evidenceRefs: [...packet.evidenceRefs] };
    expect(fileObservationPacketChecksumV1(packet)).toBe(fileObservationPacketChecksumV1(reordered));
  });

  it('rejects invalid spans and authoritative packets', () => {
    expect(() => fileObservationPacketV1Schema.parse({ ...packet, canonicalAuthority: true })).toThrow();
    expect(() => fileObservationPacketV1Schema.parse({ ...packet, evidenceRefs: [{ ...packet.evidenceRefs[0], span: { startByte: 5, endByte: 2 } }] })).toThrow();
  });
});
