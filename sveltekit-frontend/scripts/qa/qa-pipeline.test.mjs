import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classify, fingerprint, groupIssues, redact, routeTemplate, stackSignature, CODES } from './error-fingerprint.mjs';
import { parseNetstatListenerPid } from './active-server-manifest.mjs';
import { verifyActiveServer } from './verify-active-server.mjs';

test('redact removes bearer tokens, query strings and emails, and truncates', () => {
  const out = redact('Bearer abc.def token=SECRET GET https://x.test/a?session=1 mail a@b.co ' + 'x'.repeat(400), 60);
  assert.ok(!out.includes('abc.def'));
  assert.ok(!out.includes('SECRET'));
  assert.equal(out.length, 60);
  assert.ok(redact('https://x.test/a?session=1').includes('?<redacted>'));
  assert.ok(!redact('mail a@b.co').includes('a@b.co'));
});

test('routeTemplate collapses UUID and numeric segments', () => {
  assert.equal(
    routeTemplate('/api/cases/b8fbe1be-dad0-4986-b51d-b28338acd71a/evidence/42'),
    '/api/cases/:id/evidence/:id',
  );
  assert.equal(routeTemplate('/api/acp/execute'), '/api/acp/execute');
});

test('stackSignature keeps function names only, first three frames', () => {
  const stack = 'TypeError: x\n    at render (a.svelte:10:5)\n    at onClick (b.ts:3:1)\n    at handle (c.ts:9:2)\n    at other (d.ts:1:1)';
  assert.equal(stackSignature(stack), 'render>onClick>handle');
  assert.equal(stackSignature(undefined), 'NO_STACK');
});

test('classify: explicit code wins; HTTP 5xx is a defect; bare request_id is not an error', () => {
  assert.equal(classify({ error_code: 'ACP_INVALID_JSON' }).confidence, 'EXPLICIT');
  assert.equal(classify({ source: 'http', status: 500 }).error_code, CODES.HTTP_INTERNAL_ERROR);
  assert.equal(classify({ source: 'http', status: 404 }), null);
  assert.equal(classify({ source: 'console', message: 'request_id=abc-123 ok' }), null);
  const keyword = classify({ source: 'console', message: 'Uncaught error while loading' });
  assert.equal(keyword.error_code, CODES.E2E_CONSOLE_ERROR);
  assert.equal(keyword.needsConfirmation, true);
});

test('fingerprint ignores timestamps, request IDs and UUIDs in the route', () => {
  const a = fingerprint({ error_code: 'HTTP_INTERNAL_ERROR', feature_label: 'agent.acp.execute', route: '/api/cases/b8fbe1be-dad0-4986-b51d-b28338acd71a' });
  const b = fingerprint({ error_code: 'HTTP_INTERNAL_ERROR', feature_label: 'agent.acp.execute', route: '/api/cases/11111111-2222-4333-8444-555555555555' });
  assert.equal(a, b);
  const c = fingerprint({ error_code: 'HTTP_INTERNAL_ERROR', feature_label: 'infra.vite', route: '/api/cases/x' });
  assert.notEqual(a, c);
});

test('groupIssues: 100 identical occurrences collapse into one issue with count 100', () => {
  const events = Array.from({ length: 100 }, (_, i) => ({
    source: 'http',
    status: 500,
    route: `/api/acp/execute?ts=${i}`,
    feature_label: 'agent.acp.execute',
    run_id: `run-${i}`,
    message: `request ${i}`,
  }));
  const issues = groupIssues(events);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].occurrences, 100);
  assert.equal(issues[0].severity, 'P1');
  assert.equal(issues[0].firstRunId, 'run-0');
  assert.equal(issues[0].lastRunId, 'run-99');
});

test('parseNetstatListenerPid finds the LISTENING owner, including IPv6 rows', () => {
  const text = [
    '  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       36612',
    '  TCP    [::]:5173              [::]:0                 LISTENING       36612',
    '  TCP    127.0.0.1:5434         0.0.0.0:0              LISTENING       13904',
    '  TCP    127.0.0.1:5173         127.0.0.1:50000        ESTABLISHED     99',
  ].join('\n');
  assert.equal(parseNetstatListenerPid(text, 5173), 36612);
  assert.equal(parseNetstatListenerPid(text, 9999), null);
});

test('verifyActiveServer refuses a missing or non-running manifest', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-manifest-'));
  const missing = await verifyActiveServer(path.join(dir, 'none.json'));
  assert.equal(missing.code, 'MANIFEST_MISSING');
  const file = path.join(dir, 'm.json');
  writeFileSync(file, JSON.stringify({ status: 'not_verified', port: 5173, pid: 1 }));
  const notRunning = await verifyActiveServer(file);
  assert.equal(notRunning.code, 'MANIFEST_NOT_RUNNING');
});

test('redact strips ANSI color codes from runner output', () => {
  assert.equal(redact('\u001b[31mExpected: 2\u001b[39m'), 'Expected: 2');
});
