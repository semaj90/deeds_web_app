import { describe, expect, it } from 'vitest';
import { createHash as hashBytes } from 'node:crypto';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  resolveCachedPacketCandidatesV1,
  verifyCachedPacketCandidateSourceBindingSpanV1,
  verifyCachedPacketCandidateSourceSpanV1,
} from './cached-packet-candidate-resolution-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;

function makeMap(sourceRefs = ['src/ace.ts']) {
  return materializeCandidateOrdinalMap({
    candidates: sourceRefs.map((sourceRef, index) => ({
      canonicalId: `candidate:${index}`,
      packetKey: `packet:${index}`,
      sourceRef,
      treeNodeId: null,
      symbolVersionId: `symbol:${index}`,
      workspaceRevision,
      sourceRevision,
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    })),
    candidateSnapshotRevision: `sha256:${'c'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:candidate-map:v1',
  });
}

describe('resolveCachedPacketCandidatesV1', () => {
  it('resolves an exact source-ref hint only through the frozen ordinal map', () => {
    const result = resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap: makeMap(),
      hints: [{ hintId: 'cache:1', kind: 'SOURCE_REF', sourceRef: 'src/ace.ts' }],
    });

    expect(result.matches).toEqual([{
      hintId: 'cache:1',
      candidateOrdinal: 0,
      canonicalId: 'candidate:0',
      packetKey: 'packet:0',
      sourceRef: 'src/ace.ts',
      sourceRevision,
      workspaceRevision,
    }]);
    expect(result.evidenceStatus).toBe('UNVERIFIED');
    expect(result.canonicalAuthority).toBe(false);
  });

  it('rejects centroid-only, missing, and ambiguous source hints without promoting them', () => {
    const result = resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap: makeMap(['src/ace.ts', 'src/ace.ts']),
      hints: [
        { hintId: 'centroid', kind: 'CENTROID' },
        { hintId: 'missing', kind: 'SOURCE_REF', sourceRef: 'src/missing.ts' },
        { hintId: 'ambiguous', kind: 'SOURCE_REF', sourceRef: 'src/ace.ts' },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.rejections).toEqual([
      { hintId: 'ambiguous', reason: 'SOURCE_REF_AMBIGUOUS' },
      { hintId: 'centroid', reason: 'CENTROID_HINT_NOT_EVIDENCE' },
      { hintId: 'missing', reason: 'CANONICAL_CANDIDATE_NOT_FOUND' },
    ]);
    expect(result.status).toBe('NO_RESOLVED_HINTS');
    expect(result.evidenceStatus).toBe('UNVERIFIED');
  });

  it('fails closed on a mismatched workspace revision', () => {
    expect(() => resolveCachedPacketCandidatesV1({
      workspaceRevision: `sha256:${'d'.repeat(64)}`,
      ordinalMap: makeMap(),
      hints: [],
    })).toThrow('CACHED_PACKET_CANDIDATE_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects duplicate hint identifiers', () => {
    expect(() => resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap: makeMap(),
      hints: [
        { hintId: 'same', kind: 'SOURCE_REF', sourceRef: 'src/ace.ts' },
        { hintId: 'same', kind: 'CENTROID' },
      ],
    })).toThrow('CACHED_PACKET_HINT_ID_INVALID_OR_DUPLICATE');
  });

  it('independently verifies exact UTF-8 source bytes without admitting the evidence', () => {
    const sourceBytes = Buffer.from('const title = "café";\n', 'utf8');
    const verifiedSourceRevision = `sha256:${hashBytes('sha256').update(sourceBytes).digest('hex')}`;
    const ordinalMap = materializeCandidateOrdinalMap({
      candidates: [{
        canonicalId: 'candidate:verified', packetKey: 'packet:verified', sourceRef: 'src/ace.ts', treeNodeId: null,
        symbolVersionId: 'symbol:verified', workspaceRevision, sourceRevision: verifiedSourceRevision,
        graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [],
      }],
      candidateSnapshotRevision: `sha256:${'d'.repeat(64)}`,
      workspaceRevision,
      producerRevision: 'fixture:candidate-map:v1',
    });
    const match = resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap,
      hints: [{ hintId: 'cache:verified', kind: 'SOURCE_REF', sourceRef: 'src/ace.ts' }],
    }).matches[0]!;
    const text = 'café';
    const startByte = Buffer.from(sourceBytes).indexOf(Buffer.from(text));
    const proof = verifyCachedPacketCandidateSourceSpanV1(match, {
      canonicalId: match.canonicalId,
      packetKey: match.packetKey,
      sourceRef: match.sourceRef,
      sourceRevision: match.sourceRevision,
      workspaceRevision: match.workspaceRevision,
      evidenceRef: 'evidence:span-1',
      extractorRevision: 'ast-grep:test-v1',
      startByte,
      endByte: startByte + Buffer.byteLength(text, 'utf8'),
      text,
      sourceBytes,
    });

    expect(proof.status).toBe('SOURCE_SPAN_VERIFIED_NOT_ADMITTED');
    expect(proof.spanChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(proof.admitted).toBe(false);
    expect(proof.canonicalAuthority).toBe(false);
  });

  it('rejects mismatched source revisions and candidate identities during span verification', () => {
    const sourceBytes = Buffer.from('const value = 1;', 'utf8');
    const match = resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap: makeMap(),
      hints: [{ hintId: 'cache:1', kind: 'SOURCE_REF', sourceRef: 'src/ace.ts' }],
    }).matches[0]!;
    const evidence = {
      canonicalId: match.canonicalId,
      packetKey: match.packetKey,
      sourceRef: match.sourceRef,
      sourceRevision: match.sourceRevision,
      workspaceRevision: match.workspaceRevision,
      evidenceRef: 'evidence:span-1',
      extractorRevision: 'ast-grep:test-v1',
      startByte: 0,
      endByte: 5,
      text: 'const',
      sourceBytes,
    };

    expect(() => verifyCachedPacketCandidateSourceSpanV1(match, evidence))
      .toThrow('CACHED_PACKET_EVIDENCE_SOURCE_REVISION_MISMATCH');
    expect(() => verifyCachedPacketCandidateSourceSpanV1(match, { ...evidence, canonicalId: 'candidate:other' }))
      .toThrow('CACHED_PACKET_EVIDENCE_IDENTITY_MISMATCH');
  });

  it('binds the verified span to the existing grounded-source receipt without admitting it', () => {
    const sourceBytes = Buffer.from('export const one = 1;', 'utf8');
    const sourceRevision = `sha256:${hashBytes('sha256').update(sourceBytes).digest('hex')}`;
    const ordinalMap = materializeCandidateOrdinalMap({
      candidates: [{
        canonicalId: 'packet:v2:bound', packetKey: 'packet:v2:bound', sourceRef: 'src/bound.ts', treeNodeId: null,
        symbolVersionId: 'symbol:bound', workspaceRevision, sourceRevision,
        graphRevision: null, semanticRevision: null, degradedIdentity: false, evidenceRefs: [], representationBindings: [],
      }],
      candidateSnapshotRevision: `sha256:${'e'.repeat(64)}`,
      workspaceRevision,
      producerRevision: 'fixture:candidate-map:v1',
    });
    const match = resolveCachedPacketCandidatesV1({
      workspaceRevision,
      ordinalMap,
      hints: [{ hintId: 'cache:bound', kind: 'SOURCE_REF', sourceRef: 'src/bound.ts' }],
    }).matches[0]!;
    const evidence = {
      canonicalId: match.canonicalId, packetKey: match.packetKey, sourceRef: match.sourceRef,
      sourceRevision, workspaceRevision, evidenceRef: 'evidence:bound', extractorRevision: 'ast-grep:v1',
      startByte: 0, endByte: sourceBytes.byteLength, text: sourceBytes.toString('utf8'), sourceBytes,
    };
    const receiptPayload = {
      schema: 'atlas.grounded-extraction-source-binding-receipt.v1' as const,
      status: 'VERIFIED_SOURCE_BINDING' as const,
      canonicalPacketKey: match.packetKey!,
      storagePacketKey: match.packetKey!,
      packetResolutionSource: 'V2_DIRECT' as const,
      sourceRef: match.sourceRef,
      sourceRevision,
      workspaceRevision,
      sourceBindingChecksum: `sha256:${'f'.repeat(64)}`,
      submittedTextChecksum: sourceRevision,
      byteLength: sourceBytes.byteLength,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
    const receipt = {
      ...receiptPayload,
      checksum: `sha256:${hashBytes('sha256').update(JSON.stringify(receiptPayload), 'utf8').digest('hex')}`,
    };
    const proof = verifyCachedPacketCandidateSourceBindingSpanV1(match, evidence, receipt);

    expect(proof.status).toBe('SOURCE_SPAN_VERIFIED_NOT_ADMITTED');
    expect(proof.sourceBindingReceiptChecksum).toBe(receipt.checksum);
    expect(proof.admitted).toBe(false);
    expect(() => verifyCachedPacketCandidateSourceBindingSpanV1(match, evidence, {
      ...receipt,
      workspaceRevision: `sha256:${'9'.repeat(64)}`,
    })).toThrow('CACHED_PACKET_SOURCE_BINDING_RECEIPT_MISMATCH');
  });
});
