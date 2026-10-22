import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReplayAdmission } from './ast-replay-admission-v1.mjs';

const nominations = [{ nomination_id: 'n1', byte_start: 0, byte_end: 10, upstream_node_id: 'u1' }];
const chunk = { start_byte: 0, end_byte: 10, upstream_node_id: 'u1' };
const complete = { scan_completeness: 'COMPLETE', scan_failure: null, chunks: [chunk] };
const zeroWrites = (result) => {
  assert.equal(result.revisionQualifiedWrites, 0);
  assert.equal(result.graphifyProjectionWrites, 0);
  assert.equal(result.aceAdmissionWrites, 0);
};

test('admits a COMPLETE scan whose nominated span and node match exactly', () => {
  const result = evaluateReplayAdmission({ httpOk: true, body: complete, nominations });
  assert.equal(result.admission, 'ALLOWED');
  assert.equal(result.reason, null);
  assert.equal(result.astScanCompleteness, 'COMPLETE');
  assert.equal(result.nlpStatus, 'NOT_RUN');
  zeroWrites(result);
});

test('refuses an explicit PARTIAL_AST_FAILED scan even when chunks match', () => {
  const result = evaluateReplayAdmission({
    httpOk: true,
    body: { ...complete, scan_completeness: 'PARTIAL_AST_FAILED', scan_failure: 'RuntimeError: chunker exploded' },
    nominations,
  });
  assert.equal(result.admission, 'REFUSED');
  assert.equal(result.reason, 'PARTIAL_AST_FAILED');
  assert.equal(result.astScanCompleteness, 'PARTIAL_AST_FAILED');
  zeroWrites(result);
});

test('refuses a response with no receipt (older sidecar) and never defaults it to COMPLETE', () => {
  const result = evaluateReplayAdmission({ httpOk: true, body: { chunks: [chunk] }, nominations });
  assert.equal(result.admission, 'REFUSED');
  assert.equal(result.reason, 'MISSING_RECEIPT');
  zeroWrites(result);
});

test('refuses a timeout or aborted request', () => {
  const result = evaluateReplayAdmission({ httpOk: false, timedOut: true, nominations });
  assert.equal(result.admission, 'REFUSED');
  assert.equal(result.reason, 'SIDECAR_TIMEOUT');
  zeroWrites(result);
});

test('refuses a transport error and an HTTP error status', () => {
  const transport = evaluateReplayAdmission({ httpOk: false, errorMessage: 'fetch failed', nominations });
  assert.equal(transport.reason, 'SIDECAR_ERROR:fetch failed');
  const http = evaluateReplayAdmission({ httpOk: false, body: complete, nominations });
  assert.equal(http.reason, 'SIDECAR_HTTP_ERROR');
  zeroWrites(http);
});

test('refuses a malformed response body', () => {
  for (const body of [null, 'not json', { scan_completeness: 'COMPLETE' }, { scan_completeness: 'COMPLETE', chunks: 'x' }]) {
    const result = evaluateReplayAdmission({ httpOk: true, body, nominations });
    assert.equal(result.admission, 'REFUSED');
    assert.equal(result.reason, 'MALFORMED_RESPONSE');
    zeroWrites(result);
  }
});

test('refuses a COMPLETE scan whose span does not match the nomination', () => {
  const result = evaluateReplayAdmission({
    httpOk: true,
    body: { ...complete, chunks: [{ start_byte: 0, end_byte: 9, upstream_node_id: 'u1' }] },
    nominations,
  });
  assert.equal(result.admission, 'REFUSED');
  assert.equal(result.reason, 'REPLAY_MISMATCH');
  assert.equal(result.failures[0].reason, 'LIVE_SPAN_NOT_FOUND');
});

test('refuses an ambiguous span and an upstream node mismatch', () => {
  const ambiguous = evaluateReplayAdmission({
    httpOk: true,
    body: { ...complete, chunks: [chunk, { ...chunk, upstream_node_id: 'u2' }] },
    nominations,
  });
  assert.equal(ambiguous.ambiguousSpans, 1);
  assert.equal(ambiguous.failures[0].reason, 'AMBIGUOUS_LIVE_SPAN');

  const mismatch = evaluateReplayAdmission({
    httpOk: true,
    body: { ...complete, chunks: [{ ...chunk, upstream_node_id: 'other' }] },
    nominations,
  });
  assert.equal(mismatch.admission, 'REFUSED');
  assert.equal(mismatch.failures[0].reason, 'LIVE_UPSTREAM_NODE_MISMATCH');
});

test('refuses when there are no nominations or a precondition fails', () => {
  const none = evaluateReplayAdmission({ httpOk: true, body: complete, nominations: [] });
  assert.equal(none.reason, 'NO_NOMINATIONS');
  const precondition = evaluateReplayAdmission({ httpOk: true, body: complete, nominations, preconditionsOk: false });
  assert.equal(precondition.reason, 'PRECONDITION_FAILED');
  zeroWrites(precondition);
});
