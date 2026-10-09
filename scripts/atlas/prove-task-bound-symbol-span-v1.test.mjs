import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { verifyTaskBoundSymbolSpanV1 } from './prove-task-bound-symbol-span-v1.mjs';

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fixture() {
  const sourceBytes = Buffer.from('prefix Valkey suffix');
  const startByte = sourceBytes.indexOf('Valkey');
  const unsigned = {
    schema: 'atlas.live-langextract-source-grounding-receipt.v1',
    proofReadback: 'MATCH',
    canonicalAuthority: false,
    factAdmission: 'NOT_PERFORMED',
    writesPerformed: false,
    source: {
      sourceRef: 'scripts/agent/ace-assembler-recommendations.mjs',
      packetKey: 'ace:packet:3d01c1df26b3',
      symbolVersionId: 'symbol-version:test',
      sourceRevision: sha256(sourceBytes),
      currentSourceRevision: sha256(sourceBytes),
      workspaceRevision: 'sha256:historical-workspace',
    },
    extraction: {
      providerRevision: 'fixture-extractor-v1',
      responseChecksum: sha256(Buffer.from('response')),
      validation: { spanResults: [{ extractionClass: 'CONCEPT', startByte, endByte: startByte + 6, spanChecksum: sha256(sourceBytes.subarray(startByte, startByte + 6)), status: 'SOURCE_SPAN_READBACK_MATCH' }] },
    },
    independentReadback: { status: 'MATCH', receiptChecksum: sha256(Buffer.from('prior-receipt')) },
  };
  return { sourceBytes, report: { ...unsigned, receiptChecksum: unsigned.independentReadback.receiptChecksum } };
}

test('reopens the exact selected concept bytes without admitting a fact', () => {
  const { sourceBytes, report } = fixture();
  const result = verifyTaskBoundSymbolSpanV1(report, sourceBytes);
  assert.equal(result.status, 'SOURCE_SPAN_READBACK_MATCH');
  assert.equal(result.span.text, 'Valkey');
  assert.equal(result.semanticFactAdmission, 'NOT_PERFORMED');
  assert.equal(result.canonicalAuthority, false);
});

test('rejects stale source revisions', () => {
  const { sourceBytes, report } = fixture();
  const stale = { ...report, source: { ...report.source, sourceRevision: sha256(Buffer.from('stale')) } };
  assert.throws(() => verifyTaskBoundSymbolSpanV1(stale, sourceBytes), /SOURCE_REVISION_MISMATCH/);
});

test('rejects an out-of-range or altered span', () => {
  const { sourceBytes, report } = fixture();
  const altered = structuredClone(report);
  altered.extraction.validation.spanResults[0].endByte += 100;
  assert.throws(() => verifyTaskBoundSymbolSpanV1(altered, sourceBytes), /SOURCE_SPAN_OUT_OF_RANGE/);
});

test('rejects a mismatched independent receipt reference', () => {
  const { sourceBytes, report } = fixture();
  const altered = { ...report, independentReadback: { status: 'MATCH', receiptChecksum: sha256(Buffer.from('different receipt')) } };
  assert.throws(() => verifyTaskBoundSymbolSpanV1(altered, sourceBytes), /PRIOR_RECEIPT_REFERENCE_MISMATCH/);
});
