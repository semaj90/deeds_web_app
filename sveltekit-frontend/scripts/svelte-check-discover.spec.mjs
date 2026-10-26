import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isCompleteCapture } from './svelte-check-discover.mjs';

test('accepts a complete capture only when its receipt hash matches the log', () => {
  const bytes = Buffer.from('diagnostic log');
  const summary = {
    schema: 'atlas.svelte-check-capture.v1',
    runId: 'run-1',
    gitRevision: 'revision-1',
    timedOut: false,
    interrupted: false,
    exitCode: 0,
    outputs: { logSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` },
  };
  assert.equal(isCompleteCapture(summary, bytes), true);
  assert.equal(isCompleteCapture(summary, Buffer.from('changed log')), false);
});

test('rejects missing, timed-out, or revisionless capture receipts', () => {
  const bytes = Buffer.from('log');
  assert.equal(isCompleteCapture(null, bytes), false);
  assert.equal(isCompleteCapture({ timedOut: true }, bytes), false);
  assert.equal(isCompleteCapture({ schema: 'atlas.svelte-check-capture.v1', runId: 'r', gitRevision: null, timedOut: false, interrupted: false, exitCode: 0, outputs: { logSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` } }, bytes), false);
});
