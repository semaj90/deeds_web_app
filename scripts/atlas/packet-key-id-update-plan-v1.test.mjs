import test from 'node:test';
import assert from 'node:assert/strict';
import { planPacketKeyIdUpdatesV1, PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1 } from './lib/packet-key-id-update-plan-v1.mjs';

const row = (k, sr, t) => ({ packet_key: k, source_ref: sr, title_id: t });
const file = (k, sr, t, d = 'ui') => ({ packet_key: k, source_ref: sr, title_id: t, domain_class: d });
const assign = (f) => (f.domain_class ? `OS-${f.domain_class}` : null);
const plan = (files, rows, extra = {}) => planPacketKeyIdUpdatesV1({ files, packetRows: rows, assign, ...extra });
const st = (p) => p.entries.map((e) => e.status);

test('statement shape is data, keyed by packet_key + source_ref, never the label', () => {
  assert.equal(PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1.executable, false);
  assert.equal(PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1.labelUsedAsKey, false);
  assert.doesNotMatch(PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1.template, /WHERE\s+title_id/i);
});
test('exact packet_key + source_ref match qualifies for dry-run only, never apply-ready', () => {
  const p = plan([file('p:a', 'src/a.ts', 'title:a:00000001')], [row('p:a', 'src/a.ts', 'title:a:00000001')]);
  assert.deepEqual(st(p), ['QUALIFIED_DRY_RUN_ONLY']);
  assert.equal(p.applyReady, false);
  assert.equal(p.sourceBindingEvidence, 'NOT_PROVIDED');
  assert.equal(p.writesPerformed, false);
});
test('title label alone cannot select a row: unknown packet_key blocks even if the title exists in the DB', () => {
  const p = plan([file('p:zzz', 'src/a.ts', 'title:a:00000001')], [row('p:a', 'src/a.ts', 'title:a:00000001')]);
  assert.deepEqual(st(p), ['BLOCKED_PACKET_KEY_NOT_FOUND']);
});
test('source_ref mismatch and stale title label block', () => {
  assert.deepEqual(st(plan([file('p:a', 'src/other.ts', 't')], [row('p:a', 'src/a.ts', 't')])), ['BLOCKED_SOURCE_REF_MISMATCH']);
  assert.deepEqual(st(plan([file('p:a', 'src/a.ts', 'title:a:11111111')], [row('p:a', 'src/a.ts', 'title:a:22222222')])), ['BLOCKED_TITLE_LABEL_STALE_OR_MISMATCHED']);
});
test('missing fields and missing assignment block', () => {
  assert.deepEqual(st(plan([file(null, 's', 't')], [])), ['BLOCKED_PACKET_KEY_MISSING']);
  assert.deepEqual(st(plan([file('p:a', null, 't')], [row('p:a', 's', 't')])), ['BLOCKED_SOURCE_REF_MISSING']);
  assert.deepEqual(st(plan([file('p:a', 's', 't', '')], [row('p:a', 's', 't')])), ['BLOCKED_NO_ASSIGNMENT']);
});
test('duplicate and conflicting input assignments block, duplicate DB key blocks', () => {
  const rows = [row('p:a', 's', 't')];
  assert.deepEqual(st(plan([file('p:a', 's', 't', 'ui'), file('p:a', 's', 't', 'ui')], rows)), ['QUALIFIED_DRY_RUN_ONLY', 'BLOCKED_DUPLICATE_PACKET_KEY_IN_INPUT']);
  assert.deepEqual(st(plan([file('p:a', 's', 't', 'ui'), file('p:a', 's', 't', 'db')], rows)), ['QUALIFIED_DRY_RUN_ONLY', 'BLOCKED_CONFLICTING_ASSIGNMENT_FOR_PACKET_KEY']);
  assert.deepEqual(st(plan([file('p:a', 's', 't')], [row('p:a', 's', 't'), row('p:a', 's', 't')])), ['BLOCKED_DUPLICATE_PACKET_KEY_IN_DB']);
});
test('alias-only keys are reported, not resolved by string similarity', () => {
  const p = plan([file('packet:abcdef012345', 's', 't')], [row('ace:packet:abcdef012345', 's', 't')], { aliasKeys: new Set(['packet:abcdef012345']) });
  assert.deepEqual(st(p), ['BLOCKED_ALIAS_ONLY_NEEDS_RESOLVER']);
});
test('invalid input throws', () => {
  assert.throws(() => planPacketKeyIdUpdatesV1({ files: null, packetRows: [], assign }), /PLAN_INPUT_INVALID/);
});

import { parsePacketsSnapshotTsvV1 } from './lib/packet-key-id-update-plan-v1.mjs';
test('snapshot TSV parser: empty fields become null, CRLF tolerated, bad lines throw', () => {
  const rows = parsePacketsSnapshotTsvV1('p:a\tsrc/a.ts\ttitle:a:00000001\r\np:b\t\t\n');
  assert.deepEqual(rows, [
    { packet_key: 'p:a', source_ref: 'src/a.ts', title_id: 'title:a:00000001' },
    { packet_key: 'p:b', source_ref: null, title_id: null },
  ]);
  assert.throws(() => parsePacketsSnapshotTsvV1('\tsrc/a.ts\tt'), /SNAPSHOT_LINE_INVALID:1/);
  assert.throws(() => parsePacketsSnapshotTsvV1(null), /SNAPSHOT_TEXT_REQUIRED/);
});
