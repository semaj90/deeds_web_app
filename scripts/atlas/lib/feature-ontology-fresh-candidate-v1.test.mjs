import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeFreshOntologyCandidate,
  verifyFreshOntologyCandidateSourceReadback,
  verifyFreshOntologySourceSpan,
} from './feature-ontology-fresh-candidate-v1.mjs';

test('verifies exact Unicode character span and derives UTF-8 byte offsets', () => {
  const source = 'const label = "🧭 concept";';
  const startChar = source.indexOf('concept');
  const result = verifyFreshOntologySourceSpan(source, startChar, startChar + 7, 'concept');
  assert.equal(result.valid, true);
  assert.equal(result.startByte, Buffer.byteLength(source.slice(0, startChar), 'utf8'));
  assert.equal(result.endByte - result.startByte, Buffer.byteLength('concept', 'utf8'));
});

test('rejects mismatched text and out-of-range character spans', () => {
  assert.deepEqual(verifyFreshOntologySourceSpan('source text', 0, 6, 'other'), {
    valid: false,
    reason: 'SPAN_TEXT_MISMATCH',
  });
  assert.equal(verifyFreshOntologySourceSpan('abc', 0, 4, 'abcd').reason, 'CHAR_SPAN_OUT_OF_RANGE');
  assert.equal(verifyFreshOntologySourceSpan('🧭', 0, 1, '\ud83e').reason, 'CHAR_SPAN_SPLITS_SURROGATE_PAIR');
});

test('grounded candidates require independently verified byte offsets', () => {
  const base = {
    candidateId: 'c1', packetKey: null, identityStatus: 'SOURCE_ONLY_UNBOUND', sourceRef: 'src/a.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
    subjectId: 's1', objectId: 'concept:x', extractorRevision: 'extractor:r1',
    evidenceRefs: ['source:ref'], sourceSpanGrounded: true,
    sourceSpan: { startChar: 0, endChar: 3, text: 'foo' },
  };
  assert.throws(() => normalizeFreshOntologyCandidate(base), /verified_byte_offsets_required/);
  assert.equal(normalizeFreshOntologyCandidate({
    ...base,
    sourceSpan: { ...base.sourceSpan, startByte: 0, endByte: 3 },
  }).sourceSpan.endByte, 3);
});

test('source-only candidates never synthesize packet identity from paths', () => {
  const candidate = normalizeFreshOntologyCandidate({
    candidateId: 'c2', sourceRef: 'src/a.ts', sourceRevision: `sha256:${'a'.repeat(64)}`,
    workspaceRevision: `sha256:${'b'.repeat(64)}`, subjectId: 'src/a.ts', objectId: 'concept:x',
    extractorRevision: 'extractor:r1', evidenceRefs: ['source:ref'],
  });
  assert.equal(candidate.packetKey, null);
  assert.equal(candidate.identityStatus, 'SOURCE_ONLY_UNBOUND');
  assert.throws(() => normalizeFreshOntologyCandidate({
    candidateId: 'c3', packetKey: 'packet:invented', sourceRef: 'src/a.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`, workspaceRevision: `sha256:${'b'.repeat(64)}`,
    subjectId: 'src/a.ts', objectId: 'concept:x', extractorRevision: 'extractor:r1', evidenceRefs: ['source:ref'],
  }), /CANONICAL_IDENTITY_REQUIRES_ATLAS_JOIN/);
});

test('independent source readback checks revision and character-to-byte coordinates', () => {
  const sourceBytes = Buffer.from('const marker = "🧭 fact";', 'utf8');
  const sourceText = sourceBytes.toString('utf8');
  const startChar = sourceText.indexOf('fact');
  const startByte = Buffer.byteLength(sourceText.slice(0, startChar), 'utf8');
  const candidate = {
    sourceRevision: `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`,
    sourceSpanGrounded: true,
    sourceSpan: { startChar, endChar: startChar + 4, startByte, endByte: startByte + 4, text: 'fact' },
  };
  assert.equal(verifyFreshOntologyCandidateSourceReadback(candidate, sourceBytes).valid, true);
  assert.equal(verifyFreshOntologyCandidateSourceReadback(candidate, Buffer.from('different')).reason, 'SOURCE_BYTES_REVISION_MISMATCH');
  assert.equal(verifyFreshOntologyCandidateSourceReadback({ ...candidate, sourceSpan: { ...candidate.sourceSpan, startByte: startByte + 1 } }, sourceBytes).reason, 'SOURCE_SPAN_BYTE_OFFSETS_MISMATCH');
});
