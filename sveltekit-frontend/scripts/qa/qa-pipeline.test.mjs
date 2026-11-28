import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  classify,
  DESIGN_FEATURE_LABELS,
  fingerprint,
  groupIssues,
  groupIssuesWithAudit,
  normalizeQaEvent,
  QA_EVENT_SCHEMA_VERSION,
  redact,
  routeTemplate,
  stackSignature,
  CODES,
} from './error-fingerprint.mjs';
import { parseNetstatListenerPid } from './active-server-manifest.mjs';
import { verifyActiveServer } from './verify-active-server.mjs';
import { buildIssues } from './build-qa-issues.mjs';
import { collectServerLogEvents } from './server-log-events.mjs';

function serverLogFixture(context, lines) {
  const frontendRoot = mkdtempSync(path.join(tmpdir(), 'qa-server-log-'));
  context.after(() => rmSync(frontendRoot, { recursive: true, force: true }));
  const directory = path.join(frontendRoot, 'logs', 'startup');
  mkdirSync(directory, { recursive: true });
  const stdout_log = path.join(directory, 'vite-fixture.log');
  writeFileSync(stdout_log, `${lines.join('\n')}\n`);
  const report = { stats: { startTime: '2026-11-26T06:05:00Z', duration: 10_000 }, suites: [] };
  const serverManifest = { status: 'running', pid: 123, started_at: '2026-11-26T06:04:00.0000000Z', stdout_log };
  return { frontendRoot, serverManifest, report };
}

test('QA aggregation links only dated 5xx and server exceptions within the run boundary', async (context) => {
  const requestLine = (timestamp, message) => JSON.stringify({ timestamp, level: 'error', message });
  const fixture = serverLogFixture(context, [
    requestLine('2026-11-26T06:04:59Z', 'GET /api/old 500'),
    '06:05:01 [vite:error] timestamp has no date',
    requestLine('2026-11-26T06:05:02Z', 'GET /api/cases/123?secret=HIDDEN 500'),
    JSON.stringify({ timestamp: '2026-11-26T06:05:03Z', level: 'error', message: 'Loader failed', error: { stack: 'Error: hidden\n    at handler (/tmp/app:1:1)' } }, null, 2),
    '2026-11-26T06:05:04Z [vite:error] build failed Bearer PRIVATE_TOKEN',
    requestLine('2026-11-26T06:05:10.001Z', 'GET /api/later 500'),
    requestLine('2026-11-26T06:05:05Z', 'GET /api/expected 404'),
  ]);
  const browserAttachment = path.join(fixture.frontendRoot, 'browser.json');
  writeFileSync(browserAttachment, JSON.stringify([{ source: 'http', route: '/api/cases/123', status: 500 }]));
  fixture.report.suites = [{ specs: [{ title: 'browser 500', tags: ['feature:case.read'], tests: [{
    status: 'expected', results: [{ attachments: [{ name: 'qa-browser-events.json', path: browserAttachment }] }],
  }] }] }];

  const serverLog = await collectServerLogEvents(fixture.report, fixture);
  assert.equal(serverLog.status, 'LINKED');
  assert.equal(serverLog.events.length, 3);
  assert.equal(serverLog.undatedErrors, 1);
  assert.ok(serverLog.events.every((event) => event.source === 'server'));
  const report = buildIssues(fixture.report, { runId: 'fixture-run', serverLog });
  assert.equal(report.totals.issues, 4);
  assert.equal(report.server_log.events, 3);
  const httpIssues = report.issues.filter((issue) => issue.error_code === CODES.HTTP_INTERNAL_ERROR);
  assert.equal(httpIssues.length, 2);
  assert.ok(httpIssues.every((issue) => issue.firstRunId === 'fixture-run' && issue.route_template === '/api/cases/:id'));
  const serverIssue = httpIssues.find((issue) => issue.server_log_ref);
  assert.equal(serverIssue.server_log_ref, 'logs/startup/vite-fixture.log#L3');
  assert.deepEqual(serverIssue.evidence_refs, [serverIssue.server_log_ref]);
  assert.doesNotMatch(JSON.stringify(report), /HIDDEN|PRIVATE_TOKEN|\/tmp\/app|api\/(?:old|later|expected)/);
});

test('QA log correlation merges the two records of one failed request by requestId', async (context) => {
  // Pretty-printed like productionLogger's dev console output.
  const record = (message, extra) => JSON.stringify({ timestamp: '2026-11-26T06:05:02Z', level: 'error', message, ...extra }, null, 2);
  const thrown = (requestId) => record('[abc] Unhandled error in /api/cases/123', {
    context: { requestId, endpoint: '/api/cases/123' },
    error: { name: 'Error', stack: 'Error: boom\n    at handler (src/routes/api/x/+server.ts:3:9)' },
  });
  const logged = (requestId, status = 500) => record(`GET /api/cases/123 ${status}`, { context: { requestId } });

  for (const lines of [[thrown('r1'), logged('r1')], [logged('r1'), thrown('r1')]]) {
    const fixture = serverLogFixture(context, lines);
    const serverLog = await collectServerLogEvents(fixture.report, fixture);
    assert.equal(serverLog.events.length, 1);
    assert.equal(serverLog.events[0].evidence_refs.length, 2);
    assert.match(serverLog.events[0].stack, /boom/);
    const { issues } = buildIssues(fixture.report, { runId: 'merge', serverLog });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].error_code, CODES.HTTP_INTERNAL_ERROR);
    assert.equal(issues[0].route_template, '/api/cases/:id');
  }

  const separate = serverLogFixture(context, [thrown('r1'), logged('r2', 504), thrown(undefined)]);
  const unmerged = await collectServerLogEvents(separate.report, separate);
  assert.equal(unmerged.events.length, 3);
  assert.deepEqual(unmerged.events.map((event) => event.status), [undefined, 504, undefined]);
  assert.equal(unmerged.events[0].route, '/api/cases/:id');
});

test('QA log correlation fails closed on an unbound run, newer server, path escape and size cap', async (context) => {
  const fixture = serverLogFixture(context, ['2026-11-26T06:05:02Z GET /api/example 500']);
  const collect = (report, manifest = fixture.serverManifest) => collectServerLogEvents(report, {
    frontendRoot: fixture.frontendRoot, serverManifest: manifest,
  });
  assert.equal((await collect({})).status, 'RUN_WINDOW_UNAVAILABLE');
  assert.equal((await collect(fixture.report, null)).status, 'SERVER_MANIFEST_UNAVAILABLE');
  assert.equal((await collect(fixture.report, { ...fixture.serverManifest, started_at: '2026-11-26T06:05:01Z' })).status, 'SERVER_INSTANCE_OUTSIDE_RUN');
  const outside = path.join(fixture.frontendRoot, 'vite-outside.log');
  writeFileSync(outside, '2026-11-26T06:05:02Z GET /api/example 500\n');
  const rejected = await collect(fixture.report, { ...fixture.serverManifest, stdout_log: outside });
  assert.equal(rejected.status, 'SERVER_LOG_OUTSIDE_STARTUP_LOGS');
  assert.deepEqual(rejected.events, []);
  truncateSync(fixture.serverManifest.stdout_log, 16 * 1024 * 1024 + 1);
  assert.equal((await collect(fixture.report)).status, 'SERVER_LOG_BYTE_LIMIT_EXCEEDED');
});

test('qa:issues CLI reads the recorded manifest and builds the correlated issues artifact', (context) => {
  const fixture = serverLogFixture(context, ['2026-11-26T06:05:02Z GET /api/example 503']);
  const runDir = path.join(fixture.frontendRoot, 'logs', 'qa', 'fixture-run');
  const scriptsDir = path.join(fixture.frontendRoot, 'scripts', 'qa');
  mkdirSync(runDir, { recursive: true });
  mkdirSync(scriptsDir, { recursive: true });
  for (const file of ['build-qa-issues.mjs', 'error-fingerprint.mjs', 'server-log-events.mjs']) {
    copyFileSync(new URL(`./${file}`, import.meta.url), path.join(scriptsDir, file));
  }
  writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(fixture.report));
  writeFileSync(path.join(runDir, '..', 'active-server.json'), JSON.stringify(fixture.serverManifest));
  const stdout = execFileSync(process.execPath, [path.join(scriptsDir, 'build-qa-issues.mjs'), 'fixture-run'], { encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).server_log.status, 'LINKED');
  const output = JSON.parse(readFileSync(path.join(runDir, 'issues.json'), 'utf8'));
  assert.equal(output.issues[0].actual_status, 503);
  assert.equal(output.issues[0].firstRunId, 'fixture-run');
  assert.equal(output.issues[0].server_log_ref, 'logs/startup/vite-fixture.log#L1');
});

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


test('normalizeQaEvent, DESIGN_FEATURE_LABELS, tags, and suppression audit work together', () => {
  assert.equal(Object.keys(DESIGN_FEATURE_LABELS).length, 17);
  assert.equal(DESIGN_FEATURE_LABELS['ai.chat'].registryKey, 'atlas.ai.chat');
  assert.equal(DESIGN_FEATURE_LABELS['poi.directory'].registryKey, 'atlas.poi.directory');
  assert.equal(DESIGN_FEATURE_LABELS['reports.builder'].registryKey, 'atlas.reports.builder');
  const norm = normalizeQaEvent({
    source: 'http',
    status: 500,
    expected_status: 200,
    actual_status: 500,
    server_log_ref: 'logs/task-output/pipeline-test/dev.log#L42',
    evidence_refs: ['trace-1.zip'],
    tags: ['a2a', 'rpc', 'a2a'],
    feature_label: 'agent.a2a.rpc',
    route: '/api/agent/rpc',
  });
  assert.equal(norm.schema_version, QA_EVENT_SCHEMA_VERSION);
  assert.equal(norm.suppressed, false);
  assert.deepEqual(norm.tags, ['a2a', 'rpc']);

  const { issues, suppressedEvents } = groupIssuesWithAudit([
    norm,
    {
      source: 'http',
      status: 400,
      expected_status: 400,
      actual_status: 400,
      feature_label: 'agent.acp.execute',
      route: '/api/acp/execute',
      message: 'expected 400 validation failure',
    },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].feature_registry_key, 'atlas.agent.a2a.rpc');
  assert.equal(issues[0].server_log_ref, 'logs/task-output/pipeline-test/dev.log#L42');
  assert.deepEqual(issues[0].tags, ['a2a', 'rpc']);
  assert.equal(suppressedEvents.length, 1);
  assert.equal(suppressedEvents[0].suppressed, true);
});
