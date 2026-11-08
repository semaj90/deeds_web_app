import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildTierBDraft, proposeDomain } from './build-tier-b-task-draft-v1.mjs';

const DOMAINS = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'];
const file = ['# T', '', '- [ ] verify session token permissions for login', '- [x] caf\u00e9 \u65e5\u672c cache warm ttl expiry policy', '- [ ] short', '- [ ] write overview notes for the team briefing'].join('\n');
const files = { 'openspec/changes/c/tasks.md': Buffer.from(file, 'utf8'), 'openspec/changes/crlf/tasks.md': Buffer.from(file.replace(/\n/g, '\r\n'), 'utf8') };
const readBytes = (r) => files[r] ?? null;
const row = (source, line, n, status = 'MATCHED_EXACT') => ({ source, line, status, stableKey: `${source.split('/')[2]}#${String(n).padStart(16, '0')}` });
const xw = [row('openspec/changes/c/tasks.md', 3, 1), row('openspec/changes/c/tasks.md', 4, 2), row('openspec/changes/c/tasks.md', 5, 3), row('openspec/changes/c/tasks.md', 6, 4),
  row('openspec/changes/crlf/tasks.md', 4, 5), { source: 'openspec/changes/c/tasks.md', line: 3, status: 'FILE_NOT_IN_WORKBOARD', stableKey: null }];
const build = (over = {}) => buildTierBDraft({ crosswalkRows: xw, readBytes, domains: DOMAINS, ...over });

test('binds exact text, the whole-file sha256 and a byte range that slices back to the task line (LF, CRLF, unicode)', () => {
  const { rows } = build();
  assert.equal(rows.length, 4); // short task and unresolved row are skipped
  for (const r of rows) {
    const bytes = files[r.sourceRef];
    assert.equal(r.sourceRevision, `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`);
    const line = bytes.subarray(r.evidenceSpan.byteStart, r.evidenceSpan.byteEnd).toString('utf8');
    assert.ok(/^\s*[-*]\s*\[[ xX]\]/.test(line) && line.includes(r.textEvidence));
  }
});

test('Tier B: no workspace revision, tier marker, review status PROPOSED, no authority', () => {
  for (const r of build().rows) {
    assert.equal(r.tier, 'B');
    assert.equal('workspaceRevision' in r, false);
    assert.equal(r.reviewStatus, 'PROPOSED');
    assert.equal(r.canonical_authority, false);
  }
});

test('skips unresolved rows, short tasks, missing files and non-task lines with counted reasons', () => {
  const { summary } = buildTierBDraft({ crosswalkRows: [...xw, row('openspec/changes/gone/tasks.md', 1, 9), row('openspec/changes/c/tasks.md', 1, 8)], readBytes, domains: DOMAINS });
  assert.equal(summary.skipped.NOT_RESOLVED, 1);
  assert.equal(summary.skipped.TEXT_TOO_SHORT, 1);
  assert.equal(summary.skipped.SOURCE_UNREADABLE, 1);
  assert.equal(summary.skipped.LINE_NOT_A_TASK, 1);
});

test('deterministic for a seed, different for another; per-domain cap with a reserve; shortfalls reported', () => {
  assert.deepEqual(build().rows, build().rows);
  const many = Array.from({ length: 200 }, (_, i) => `- [ ] verify session token permissions login case ${i} auth check`).join('\n');
  const f2 = { 'openspec/changes/m/tasks.md': Buffer.from(many, 'utf8') };
  const rowsX = Array.from({ length: 200 }, (_, i) => row('openspec/changes/m/tasks.md', i + 1, i));
  const run = (seed) => buildTierBDraft({ crosswalkRows: rowsX, readBytes: (r) => f2[r] ?? null, domains: DOMAINS, seed, perDomain: 50, reservePerDomain: 10 });
  const a = run('s1'), b = run('s2');
  assert.equal(a.summary.counts.auth.primary, 50);
  assert.equal(a.summary.counts.auth.reserve, 10);
  assert.equal(a.rows.filter((r) => r.pool === 'PRIMARY').length, 50);
  assert.notDeepEqual(a.rows.map((r) => r.id), b.rows.map((r) => r.id));
  assert.equal(a.summary.shortfalls.ui, 50);
  assert.equal(a.summary.shortfalls.auth, undefined);
});

test('the keyword proposal is advisory: unmatched text falls back to general', () => {
  assert.equal(proposeDomain('verify session token permissions'), 'auth');
  assert.equal(proposeDomain('write overview notes for the team'), 'general');
});
