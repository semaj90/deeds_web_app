import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySidecarAstCompleteness,
  checkRouteRevision,
  summarizeRouteRun,
  planToRouteDecisions,
  accountForSubmittedSources,
} from './graphify-route-receipt-v1.mjs';

test('submitted sources reconcile to exactly one disposition each', () => {
  const plan = [{ sourceRef: 'a.svelte', outcome: 'WOULD_EXTRACT' }, { sourceRef: 'b.py', outcome: 'PARSE_FAILED' }];
  const unsupported = [{ sourceRef: 'c.sql', status: 'NO_PARSER_RULE', reason: 'UNSUPPORTED_EXTENSION' }];
  const result = accountForSubmittedSources(['a.svelte', 'b.py', 'c.sql', 'd.ts', 'e.md', 'e.md'], plan, unsupported);
  assert.equal(result.submitted, 6);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.dispositions, {
    'CANDIDATE_OUTCOME:WOULD_EXTRACT': 1,
    'CANDIDATE_OUTCOME:PARSE_FAILED': 1,
    UNSUPPORTED_ROUTE: 1,
    NO_EXACT_REVISION_ROW: 3,
  });
  assert.deepEqual(result.notInPool, ['d.ts', 'e.md', 'e.md']);
});

test('already-processed exact rows are distinguished from missing exact-revision rows', () => {
  const status = new Map([['x.md', 'PROCESSED'], ['y.json', 'UNPROCESSED']]);
  const result = accountForSubmittedSources(['x.md', 'y.json', 'z.ts'], [], [], status);
  assert.deepEqual(result.dispositions, {
    ALREADY_PROCESSED_AT_ADMITTED_REVISION: 1,
    'EXACT_ROW_NOT_ATTEMPTED:UNPROCESSED': 1,
    NO_EXACT_REVISION_ROW: 1,
  });
  assert.equal(result.reconciled, true);
});

test('plan entries map to route decisions without counting partial files as covered', () => {
  const decisions = planToRouteDecisions([
    { sourceRef: 'a.py', outcome: 'WOULD_EXTRACT', routeLanguage: 'python' },
    { sourceRef: 'b.md', outcome: 'WOULD_EXTRACT', fileKind: 'markdown' },
    { sourceRef: 'c.ts', outcome: 'PARSE_FAILED', error: 'SIDECAR_AST_NOT_COMPLETE:PARTIAL_SYNTAX_ERRORS:RECOVERED_WITH_ERRORS' },
    { sourceRef: 'd.sql', outcome: 'PARSE_FAILED', error: 'SIDECAR_ROUTE_UNAVAILABLE:NO_PARSER_RULE:UNSUPPORTED_EXTENSION' },
    { sourceRef: 'e.py', outcome: 'SOURCE_REVISION_MISMATCH' },
  ]);
  assert.equal(decisions[0].outcome, 'COMPLETE');
  assert.equal(decisions[0].language, 'python');
  assert.equal(decisions[1].language, 'local:markdown');
  assert.equal(decisions[2].outcome, 'PARTIAL_SYNTAX_ERRORS');
  assert.equal(decisions[3].outcome, 'PARSE_FAILED');
  const summary = summarizeRouteRun(decisions);
  assert.equal(summary.covered, 2);
  assert.equal(summary.partial, 1);
  assert.equal(summary.rejected, 2);
});

const clean = { schema: 'atlas.ast.evidence.v1', chunks: [{}], syntax_status: 'CLEAN', scan_completeness: 'COMPLETE', scan_failure: null, diagnostics: [] };

test('complete source is COMPLETE', () => {
  assert.equal(classifySidecarAstCompleteness(clean).status, 'COMPLETE');
});

test('recovered syntax errors are PARTIAL and not promoted to complete', () => {
  const body = { ...clean, syntax_status: 'RECOVERED_WITH_ERRORS', diagnostics: ['Tree-sitter ERROR at line 2'] };
  const result = classifySidecarAstCompleteness(body);
  assert.equal(result.status, 'PARTIAL_SYNTAX_ERRORS');
  assert.equal(result.diagnosticCount, 1);
});

test('sidecar-reported incomplete scan is withheld even when syntax is clean', () => {
  const body = { ...clean, scan_completeness: 'INCOMPLETE', scan_failure: 'TIMEOUT' };
  assert.equal(classifySidecarAstCompleteness(body).status, 'SIDECAR_INCOMPLETE');
});

test('malformed or missing response fails closed', () => {
  assert.equal(classifySidecarAstCompleteness(null).status, 'MALFORMED');
  assert.equal(classifySidecarAstCompleteness({ ...clean, schema: 'other' }).status, 'MALFORMED');
  assert.equal(classifySidecarAstCompleteness({ ...clean, chunks: 'x' }).status, 'MALFORMED');
});

test('stale capability revision is rejected', () => {
  const route = { status: 'ROUTED', authorityRevision: 'sha256:old' };
  assert.deepEqual(checkRouteRevision(route, 'sha256:new'), { ok: false, reason: 'STALE_CAPABILITY_REVISION' });
  assert.deepEqual(checkRouteRevision(route, 'sha256:old'), { ok: true, reason: null });
});

test('unavailable sidecar and unsupported extension are not routed', () => {
  assert.deepEqual(checkRouteRevision({ status: 'BLOCKED', reason: 'SIDECAR_CAPABILITIES_UNAVAILABLE' }, 'sha256:x'),
    { ok: false, reason: 'BLOCKED' });
  assert.deepEqual(checkRouteRevision({ status: 'NO_PARSER_RULE', reason: 'UNSUPPORTED_EXTENSION' }, 'sha256:x'),
    { ok: false, reason: 'NO_PARSER_RULE' });
});

test('run summary never counts partial, blocked or rejected files as covered', () => {
  const summary = summarizeRouteRun([
    { outcome: 'COMPLETE', language: 'python' },
    { outcome: 'COMPLETE', language: 'typescript' },
    { outcome: 'PARTIAL_SYNTAX_ERRORS', language: 'typescript' },
    { outcome: 'BLOCKED', language: 'svelte' },
    { outcome: 'NO_PARSER_RULE', language: null },
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.covered, 2);
  assert.equal(summary.partial, 1);
  assert.equal(summary.rejected, 2);
  assert.deepEqual(summary.completeByLanguage, { python: 1, typescript: 1 });
});
