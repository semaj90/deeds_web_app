import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSymbolBatchPlan, validateSymbolBatchPlan, buildSymbolBaselineShards, selectLiveSymbolPlanRows, verifySymbolObservationReadback, requireSymbolBatchHeadroom, findSymbolIdentityConflicts, disambiguateSymbolOccurrenceKeysV1, disambiguateAstOccurrenceNamesV1 } from './graphify-symbol-batch-plan-v1.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rev = `sha256:${'a'.repeat(64)}`;
const producer = `sha256:${'b'.repeat(64)}`;
const context = { workspaceRevision: rev, sourceSnapshotChecksum: rev, producerRevision: producer, useLsp: false };
const row = { fileId: '00000000-0000-0000-0000-000000000001', sourceRef: 'src/a.ts', sourceRevision: rev, fileKind: 'ts_js' };
const live = { file_id: row.fileId, source_ref: row.sourceRef, source_revision: rev, workspace_revision: rev, parse_status: 'UNPROCESSED' };

test('plan checksum is deterministic and prioritizes code without discarding documents', () => {
  const json = { ...row, fileId: '00000000-0000-0000-0000-000000000002', sourceRef: 'a.json', fileKind: 'json' };
  const first = buildSymbolBatchPlan({ ...context, rows: [json, row] });
  const second = buildSymbolBatchPlan({ ...context, rows: [row, json] });
  assert.deepEqual(first, second);
  assert.equal(first.rowCount, 2);
  assert.equal(first.rows[0].sourceRef, row.sourceRef);
  assert.deepEqual(validateSymbolBatchPlan(first, context), first);
  const app = { ...row, sourceRef: 'sveltekit-frontend/src/a.ts', fileId: '00000000-0000-0000-0000-000000000003' };
  assert.equal(buildSymbolBatchPlan({ ...context, rows: [row, app] }).rows[0].sourceRef, app.sourceRef);
});

test('tampered revisions, row count, and reordered rows reject before execution', () => {
  const plan = buildSymbolBatchPlan({ ...context, rows: [row] });
  assert.throws(() => validateSymbolBatchPlan({ ...plan, rowCount: 2 }, context), /CHECKSUM_MISMATCH/);
  assert.throws(() => validateSymbolBatchPlan({ ...plan, rows: [{ ...row, sourceRevision: producer }] }, context), /CHECKSUM_MISMATCH/);
  const multi = buildSymbolBatchPlan({ ...context, rows: [row, { ...row,
    fileId: '00000000-0000-0000-0000-000000000002', sourceRef: 'src/b.ts' }] });
  assert.throws(() => validateSymbolBatchPlan({ ...multi, rows: [...multi.rows].reverse() }, context), /CHECKSUM_MISMATCH/);
});

test('changed workspace, producer, or LSP mode cannot reuse an old plan', () => {
  const plan = buildSymbolBatchPlan({ ...context, rows: [row] });
  for (const change of [{ workspaceRevision: producer }, { sourceSnapshotChecksum: producer }, { producerRevision: rev }, { useLsp: true }]) {
    assert.throws(() => validateSymbolBatchPlan(plan, { ...context, ...change }), /MISMATCH/);
  }
});

test('deterministic shards cover the complete frozen manifest exactly once', () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...row,
    fileId: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, sourceRef: `src/${String(i).padStart(4, '0')}.ts` }));
  const plan = buildSymbolBatchPlan({ ...context, rows });
  const result = buildSymbolBaselineShards(plan);
  assert.deepEqual(result.shards.map(s => [s.offset, s.maxFiles]), [[0, 250], [250, 250], [500, 1]]);
  assert.equal(new Set(result.shards.map(s => s.shardId)).size, 3);
  assert.deepEqual(result, buildSymbolBaselineShards(plan));
  assert.equal(result.shards.every(s => s.queueStatus === 'PLANNED_NOT_ENQUEUED'), true);
});

test('duplicate identities and escaping source paths are rejected', () => {
  assert.throws(() => buildSymbolBatchPlan({ ...context, rows: [row, row] }), /DUPLICATE_IDENTITY/);
  for (const sourceRef of ['../file.ts', '/file.ts', 'C:\\file.ts', 'a/../file.ts']) {
    assert.throws(() => buildSymbolBatchPlan({ ...context, rows: [{ ...row, sourceRef }] }), /SOURCE_REF_INVALID/);
  }
});

test('resume uses live exact-revision status; a plan never supplies missing admission', () => {
  assert.equal(selectLiveSymbolPlanRows([row], [live], rev).candidates.length, 1);
  for (const [rows, status] of [
    [[], 'LIVE_ADMITTED_BINDING_MISSING'],
    [[live, live], 'AMBIGUOUS_LIVE_IDENTITY'],
    [[{ ...live, source_revision: producer }], 'LIVE_IDENTITY_OR_REVISION_MISMATCH'],
    [[{ ...live, file_id: 'different' }], 'LIVE_IDENTITY_OR_REVISION_MISMATCH'],
    [[{ ...live, workspace_revision: producer }], 'LIVE_IDENTITY_OR_REVISION_MISMATCH'],
    [[{ ...live, parse_status: 'PROCESSED' }], 'ALREADY_PROCESSED'],
    [[{ ...live, parse_status: 'PARSE_FAILED' }], 'DEFERRED_PARSE_FAILED'],
  ]) {
    const result = selectLiveSymbolPlanRows([row], rows, rev);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.outcomes[0].status, status);
  }
  assert.equal(selectLiveSymbolPlanRows([row], [{ ...live, parse_status: 'PROCESSED' }], rev, true).candidates.length, 1);
});

test('independent readback rejects counts with wrong revisions, spans or missing observations', () => {
  const symbol = { stable_symbol_key: 'key', source_text_hash: 'hash', ast_fingerprint: 'fingerprint', start_byte: 0, end_byte: 40 };
  const ast = { node_kind: 'heading', qualified_symbol: 'heading', source_revision: rev, source_content_hash: rev,
    parser_name: 'markdown-symbol-extractor', parser_version: 'markdown-symbol-extractor-v1', start_byte: 0, end_byte: 40 };
  const expected = { symbols: [symbol], ast: [ast] };
  const observed = { bindings: [{ parse_status: 'PROCESSED' }], symbols: [symbol], ast: [ast] };
  assert.equal(verifySymbolObservationReadback(expected, observed).proven, true);
  for (const change of [
    { bindings: [] }, { bindings: [{ parse_status: 'UNPROCESSED' }] },
    { symbols: [] }, { symbols: [{ ...symbol, end_byte: 41 }] },
    { ast: [{ ...ast, source_revision: producer }] },
    { ast: [{ ...ast, source_content_hash: producer }] },
    { ast: [{ ...ast, parser_version: 'unknown' }] },
    { ast: [ast, ast] }, { symbols: [symbol, { ...symbol, stable_symbol_key: 'extra' }] },
  ]) assert.equal(verifySymbolObservationReadback(expected, { ...observed, ...change }).proven, false);
});

test('distinct declarations sharing one existing symbol identity are quarantined before writes', () => {
  const first = { stable_symbol_key: 'same', source_text_hash: 'a', ast_fingerprint: 'a', start_byte: 1, end_byte: 2 };
  assert.deepEqual(findSymbolIdentityConflicts([first, first]), []);
  assert.deepEqual(findSymbolIdentityConflicts([first, { ...first, start_byte: 3, end_byte: 4 }]), ['same']);
});

test('repeated declarations receive deterministic occurrence keys without changing unique keys', () => {
  const base = 'a'.repeat(64);
  const first = { stable_symbol_key: base, source_text_hash: 'x', ast_fingerprint: 'x', start_byte: 10, end_byte: 30 };
  const second = { ...first, source_text_hash: 'y', ast_fingerprint: 'y', start_byte: 40, end_byte: 60 };
  const forward = disambiguateSymbolOccurrenceKeysV1([first, second]);
  const reverse = disambiguateSymbolOccurrenceKeysV1([second, first]);

  assert.equal(forward[0].stable_symbol_key, base);
  assert.match(forward[1].stable_symbol_key, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Object.fromEntries(forward.map(item => [`${item.start_byte}:${item.end_byte}`, item.stable_symbol_key])),
    Object.fromEntries(reverse.map(item => [`${item.start_byte}:${item.end_byte}`, item.stable_symbol_key])),
  );
  assert.deepEqual(findSymbolIdentityConflicts(forward), []);
  assert.equal(disambiguateSymbolOccurrenceKeysV1([first])[0].stable_symbol_key, base);
});

test('exact duplicate observations retain one idempotent occurrence key', () => {
  const row = { stable_symbol_key: 'base', source_text_hash: 'x', ast_fingerprint: 'x', start_byte: 10, end_byte: 30 };
  const result = disambiguateSymbolOccurrenceKeysV1([row, { ...row }]);
  assert.equal(result[0].stable_symbol_key, result[1].stable_symbol_key);
  assert.deepEqual(findSymbolIdentityConflicts(result), []);
});

test('repeated AST qualified names preserve each span using deterministic occurrence names', () => {
  const first = { node_kind: 'heading', qualified_symbol: 'Guide.Overview', start_byte: 10, end_byte: 20 };
  const second = { ...first, start_byte: 40, end_byte: 50 };
  const forward = disambiguateAstOccurrenceNamesV1([first, second]);
  const reverse = disambiguateAstOccurrenceNamesV1([second, first]);
  assert.deepEqual(forward.map(row => row.qualified_symbol), ['Guide.Overview', 'Guide.Overview#occurrence:1']);
  assert.deepEqual(
    Object.fromEntries(forward.map(row => [`${row.start_byte}:${row.end_byte}`, row.qualified_symbol])),
    Object.fromEntries(reverse.map(row => [`${row.start_byte}:${row.end_byte}`, row.qualified_symbol])),
  );
  assert.deepEqual(disambiguateAstOccurrenceNamesV1([first, { ...first }]).map(row => row.qualified_symbol), [
    'Guide.Overview', 'Guide.Overview',
  ]);
});

test('valid zero-observation results require a processed admitted binding and no stray observations', () => {
  const expected = { symbols: [], ast: [] };
  assert.equal(verifySymbolObservationReadback(expected, { bindings: [{ parse_status: 'PROCESSED' }], symbols: [], ast: [] }).proven, true);
  assert.equal(verifySymbolObservationReadback(expected, { bindings: [], symbols: [], ast: [] }).proven, false);
});

test('bounded apply requires measured free space and cannot disable the reserve', () => {
  assert.throws(() => requireSymbolBatchHeadroom(740 * 1024 ** 2), /HEADROOM_REQUIRED/);
  assert.throws(() => requireSymbolBatchHeadroom(4 * 1024 ** 3, 0), /CONFIG_INVALID/);
  requireSymbolBatchHeadroom(3 * 1024 ** 3);
});

test('CLI rejects unsafe plan modes before reading a plan or connecting to the database', () => {
  const cwd = fileURLToPath(new URL('../../../', import.meta.url));
  for (const [args, error] of [
    [['--freeze-plan', 'MISSING.json', '--workspace-revision', rev, '--apply'], 'FREEZE_CANNOT_APPLY'],
    [['--freeze-plan', 'MISSING.json'], 'REQUIRES_WORKSPACE'],
    [['--plan', 'MISSING.json', '--workspace-revision', rev], 'SHARD_REQUIRED'],
    [['--freeze-plan', 'MISSING.json', '--workspace-revision', rev, '--limit', '1'], 'NO_SELECTION_OVERRIDES'],
  ]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/atlas/graphify-symbol-extractor-v1.mts', ...args],
      { cwd, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(error));
  }
});
