import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { admitArrowArtifact } from './arrow-artifact-admission-v1.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'arrow-admit-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const REV = 'fixture-src-1';
const N = 4;

function buildArtifact(name, { sem = [0.1, 0.2, 0.3, 0.4], ids = ['c:1', 'c:2', 'c:3', 'c:4'] } = {}) {
  const table = tableFromArrays({
    candidate_id: ids,
    lex: Float32Array.from([0, 0.1, 0.2, 0.3]),
    sem: Float32Array.from(sem),
  });
  const bytes = tableToIPC(table, 'file');
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return { file, sha: createHash('sha256').update(bytes).digest('hex') };
}

function descriptorFor(sha, overrides = {}) {
  return {
    artifact_sha256: sha,
    schema: ['candidate_id:utf8', 'lex:f32', 'sem:f32'],
    row_range: [0, N],
    row_count: N,
    source_revision: REV,
    ...overrides,
  };
}

test('admits a valid artifact and returns its rows', async () => {
  const { file, sha } = buildArtifact('valid.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha), REV);
  assert.equal(r.ok, true);
  assert.equal(r.rowCount, N);
});

test('refuses a checksum mismatch before any row is parsed', async () => {
  const { file, sha } = buildArtifact('checksum.arrow');
  writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from([0])]));
  const r = await admitArrowArtifact(file, descriptorFor(sha), REV);
  assert.deepEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'CHECKSUM_MISMATCH' });
  assert.equal(r.table, undefined);
});

test('refuses a schema whose field names differ', async () => {
  const { file, sha } = buildArtifact('names.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha, { schema: ['candidate_id:utf8', 'lex:f32', 'other:f32'] }), REV);
  assert.equal(r.reason, 'SCHEMA_MISMATCH');
});

test('refuses a dtype that differs from the descriptor', async () => {
  const { file, sha } = buildArtifact('dtype.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha, { schema: ['candidate_id:utf8', 'lex:f32', 'sem:utf8'] }), REV);
  assert.equal(r.reason, 'DTYPE_MISMATCH');
});

test('refuses a row range that runs past the artifact', async () => {
  const { file, sha } = buildArtifact('range.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha, { row_range: [0, N + 1], row_count: N + 1 }), REV);
  assert.equal(r.reason, 'ROW_RANGE_INVALID');
});

test('refuses a row_count that disagrees with the row range', async () => {
  const { file, sha } = buildArtifact('count.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha, { row_range: [0, 2], row_count: 3 }), REV);
  assert.equal(r.reason, 'ROW_RANGE_INVALID');
});

test('refuses a source revision that does not match the caller', async () => {
  const { file, sha } = buildArtifact('rev.arrow');
  const r = await admitArrowArtifact(file, descriptorFor(sha), 'another-revision');
  assert.equal(r.reason, 'SOURCE_REVISION_MISMATCH');
});

test('refuses a non-finite numeric value (NaN)', async () => {
  const { file, sha } = buildArtifact('nan.arrow', { sem: [0.1, Number.NaN, 0.3, 0.4] });
  const r = await admitArrowArtifact(file, descriptorFor(sha), REV);
  assert.equal(r.reason, 'NON_FINITE_VALUE');
});

test('refuses a missing descriptor', async () => {
  const r = await admitArrowArtifact(path.join(dir, 'valid.arrow'), undefined, REV);
  assert.equal(r.reason, 'DESCRIPTOR_MISSING');
});
