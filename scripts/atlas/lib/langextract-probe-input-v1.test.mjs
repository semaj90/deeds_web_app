import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildLangExtractProbeInputV1, validateLangExtractSourceSpansV1 } from './langextract-probe-input-v1.mjs';

const sourceBytes = Buffer.from('export const label = "café";\n', 'utf8');
const cafeStart = sourceBytes.indexOf(Buffer.from('café', 'utf8'));
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const binding = {
  sourceBytes,
  sourceRef: 'src/example.ts',
  sourceRevision,
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  packetKey: 'packet:example',
};

test('accepts only exact complete UTF-8 source bytes', () => {
  const result = buildLangExtractProbeInputV1(binding);
  assert.equal(result.status, 'READY_SOURCE_BYTES_BOUND');
  assert.equal(result.text, sourceBytes.toString('utf8'));
  assert.equal(result.inputChecksum, sourceRevision);
});

test('rejects a truncated input rather than reusing the full-file revision', () => {
  const result = buildLangExtractProbeInputV1({ ...binding, sourceBytes: sourceBytes.subarray(0, 10) });
  assert.equal(result.status, 'UNAVAILABLE_SOURCE_REVISION_MISMATCH');
  assert.equal('text' in result, false);
});

test('rejects incomplete packet/workspace binding before extraction', () => {
  const result = buildLangExtractProbeInputV1({ ...binding, packetKey: undefined });
  assert.equal(result.status, 'UNAVAILABLE_BINDING_INCOMPLETE');
  assert.equal('text' in result, false);
});

test('rejects over-limit source rather than slicing it', () => {
  const result = buildLangExtractProbeInputV1({ ...binding, maxChars: 4 });
  assert.equal(result.status, 'UNAVAILABLE_SOURCE_EXCEEDS_LIMIT');
  assert.equal('text' in result, false);
});

test('independently validates a response span against exact source bytes and bindings', () => {
  const input = buildLangExtractProbeInputV1(binding);
  const payload = {
    metadata: {
      grounded_execution: {
        inputChecksum: input.inputChecksum.slice('sha256:'.length),
        requestBinding: { ...binding, status: 'SOURCE_BYTES_BOUND' },
      },
      grounded_extractions: [{ class: 'CONCEPT', text: 'café', start_byte: cafeStart, end_byte: cafeStart + Buffer.byteLength('café', 'utf8') }],
    },
  };
  const result = validateLangExtractSourceSpansV1({ payload, sourceBytes, binding, inputChecksum: input.inputChecksum });
  assert.equal(result.status, 'SOURCE_SPAN_READBACK_MATCH');
  assert.equal(result.validatedCount, 1);
});

test('rejects altered span text and request identity', () => {
  const input = buildLangExtractProbeInputV1(binding);
  const payload = {
    metadata: {
      grounded_execution: {
        inputChecksum: input.inputChecksum.slice('sha256:'.length),
        requestBinding: { ...binding, status: 'SOURCE_BYTES_BOUND' },
      },
      grounded_extractions: [{ class: 'CONCEPT', text: 'wrong', start_byte: cafeStart, end_byte: cafeStart + Buffer.byteLength('café', 'utf8') }],
    },
  };
  assert.equal(validateLangExtractSourceSpansV1({ payload, sourceBytes, binding, inputChecksum: input.inputChecksum }).status, 'REJECTED_SPAN_READBACK');
  payload.metadata.grounded_extractions = [];
  payload.metadata.grounded_execution.requestBinding.packetKey = 'packet:other';
  assert.equal(validateLangExtractSourceSpansV1({ payload, sourceBytes, binding, inputChecksum: input.inputChecksum }).status, 'REJECTED_REQUEST_BINDING_MISMATCH');
});
