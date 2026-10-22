import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCompleteAstScan, astScanCompleteness, fetchSourceObservationJsonV1 } from './source-observation-http-v1.mjs';

test('accepts only a COMPLETE AST receipt as evidence', () => {
  assert.equal(astScanCompleteness({ scan_completeness: 'COMPLETE' }).complete, true);
  assert.equal(astScanCompleteness({ scan_completeness: 'PARTIAL_AST_FAILED', scan_failure: 'boom' }).complete, false);
  assert.equal(astScanCompleteness({ chunks: [] }).scanCompleteness, 'MISSING_RECEIPT');
  assert.throws(() => assertCompleteAstScan({ scan_completeness: 'PARTIAL_AST_FAILED', scan_failure: 'boom' }),
    /AST_SCAN_INCOMPLETE:PARTIAL_AST_FAILED:boom/);
  assert.throws(() => assertCompleteAstScan({ chunks: [] }), /AST_SCAN_INCOMPLETE:MISSING_RECEIPT/);
  assert.equal(assertCompleteAstScan({ scan_completeness: 'COMPLETE' }).complete, true);
});

test('retries one transport failure with identical request and deadline, preserving both attempts', async () => {
  const options = { method: 'POST', body: '{"source":"exact bytes"}', signal: AbortSignal.timeout(5000) };
  const seen = [];
  const result = await fetchSourceObservationJsonV1('http://sidecar/ast/chunk', options, { fetchImpl: async (url, request) => {
    seen.push({ url, request });
    if (seen.length === 1) throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_SOCKET' } });
    return new Response('{"status":"OBSERVED"}');
  } });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].request, seen[1].request);
  assert.deepEqual(result.body, { status: 'OBSERVED' });
  assert.deepEqual(result.attempts, [
    { attempt: 1, status: 'FAILED', error: 'fetch failed', causeCode: 'UND_ERR_SOCKET' },
    { attempt: 2, status: 'RECEIVED' },
  ]);
});

test('does not retry HTTP errors or invalid JSON', async () => {
  for (const response of [new Response('unavailable', { status: 503 }), new Response('not json')]) {
    let calls = 0;
    await assert.rejects(fetchSourceObservationJsonV1('http://sidecar/ast/chunk', {}, { fetchImpl: async () => { calls++; return response; } }));
    assert.equal(calls, 1);
  }
});

test('stops after two network failures and exposes the failure history', async () => {
  let calls = 0;
  await assert.rejects(fetchSourceObservationJsonV1('http://sidecar/ast/chunk', {}, { fetchImpl: async () => {
    calls++; throw new TypeError('fetch failed');
  } }), error => error.observationAttempts.length === 2);
  assert.equal(calls, 2);
});

test('never renews an expired deadline for a transport retry', async () => {
  let calls = 0;
  await assert.rejects(fetchSourceObservationJsonV1('http://sidecar/ast/chunk', { signal: AbortSignal.abort() }, { fetchImpl: async () => {
    calls++; throw new TypeError('fetch failed');
  } }));
  assert.equal(calls, 1);
});
