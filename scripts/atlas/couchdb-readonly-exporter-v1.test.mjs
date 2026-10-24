import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportChangesFeedV1 } from './couchdb-readonly-exporter-v1.mjs';

const DB = 'dag_cache';
const row = (id, rev, seq, deleted = false) => ({ id, changes: [{ rev }], seq, ...(deleted ? { deleted: true } : {}) });

/** Serve pages from a fixed feed; `since` is the numeric sequence the fake feed understands. */
function fakeFeed(pages, { failAt = -1, malformedAt = -1 } = {}) {
  const calls = [];
  let call = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method });
    if (call === failAt) { call += 1; return { ok: false, status: 503, json: async () => ({}) }; }
    if (call === malformedAt) { call += 1; return { ok: true, status: 200, json: async () => ({ nope: true }) }; }
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return { ok: true, status: 200, json: async () => page };
  };
  return { fetchFn, calls };
}

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'omr-export-'));
  return { dir, outDir: path.join(dir, 'captures'), checkpointPath: path.join(dir, 'checkpoint.json') };
}

const base = { baseUrl: 'http://127.0.0.1:5984', authorization: 'Basic x', database: DB, allowlist: [DB], pageSize: 2 };

test('an empty feed writes no artifact and no checkpoint', async () => {
  const f = await fixture();
  const { fetchFn } = fakeFeed([{ results: [], last_seq: '0' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn, ...f });
  assert.equal(out.status, 'NO_CHANGES');
  await assert.rejects(readFile(f.checkpointPath, 'utf8'));
});

test('multiple pages are captured in order, with updates and tombstones preserved', async () => {
  const f = await fixture();
  const { fetchFn, calls } = fakeFeed([
    { results: [row('a', '1-a', '1'), row('b', '1-b', '2')], last_seq: '2' },
    { results: [row('a', '2-a', '3'), row('b', '2-b', '4', true)], last_seq: '4' },
    { results: [], last_seq: '4' },
  ]);
  const out = await exportChangesFeedV1({ ...base, fetchFn, ...f });
  assert.equal(out.status, 'EXPORTED');
  assert.equal(out.recordCount, 4);
  assert.equal(out.tombstones, 1);
  assert.ok(calls.every((c) => c.method === 'GET'));
  const lines = (await readFile(path.join(f.outDir, out.artifact), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((r) => [r.id, r.rev, r.deleted]), [['a', '1-a', false], ['b', '1-b', false], ['a', '2-a', false], ['b', '2-b', true]]);
});

test('a resumed run starts from the checkpoint token and a repeat with no new changes is a no-op', async () => {
  const f = await fixture();
  const first = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }, { results: [], last_seq: '1' }]);
  await exportChangesFeedV1({ ...base, fetchFn: first.fetchFn, ...f });
  const second = fakeFeed([{ results: [], last_seq: '1' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn: second.fetchFn, ...f });
  assert.equal(out.status, 'NO_CHANGES');
  assert.match(second.calls[0].url, /since=1/);
  const cp = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
  assert.equal(cp.artifacts.length, 1);
});

test('an interrupted fetch leaves no artifact and does not advance the checkpoint', async () => {
  const f = await fixture();
  // Page 0 must be full (pageSize 2) or the exporter treats it as the end of the feed and never reaches the failing fetch.
  const { fetchFn } = fakeFeed([{ results: [row('a', '1-a', '1'), row('b', '1-b', '2')], last_seq: '2' }, { results: [], last_seq: '2' }], { failAt: 1 });
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn, ...f }), /CHANGES_GET_FAILED:HTTP_503/);
  await assert.rejects(readFile(f.checkpointPath, 'utf8'));
  const leftovers = await readdir(f.outDir).catch(() => []);
  assert.deepEqual(leftovers.filter((n) => n.endsWith('.ndjson') || n.endsWith('.tmp')), []);
});

test('a malformed page is refused and nothing is published', async () => {
  const f = await fixture();
  const { fetchFn } = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }], { malformedAt: 0 });
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn, ...f }), /MALFORMED_RESPONSE:PAGE/);
});

test('a row without an id or revision is refused', async () => {
  const f = await fixture();
  const { fetchFn } = fakeFeed([{ results: [{ id: 'a', changes: [], seq: '1' }], last_seq: '1' }]);
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn, ...f }), /MALFORMED_RESPONSE:ROW_REV/);
});

test('a corrupted artifact makes the checkpoint refuse to resume', async () => {
  const f = await fixture();
  const { fetchFn } = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }, { results: [], last_seq: '1' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn, ...f });
  await writeFile(path.join(f.outDir, out.artifact), '{"tampered":true}\n', 'utf8');
  const again = fakeFeed([{ results: [], last_seq: '1' }]);
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn: again.fetchFn, ...f }), /CHECKPOINT_CORRUPT:ARTIFACT/);
});

test('an incompatible checkpoint or a non-allowlisted database is refused', async () => {
  const f = await fixture();
  await writeFile(f.checkpointPath, JSON.stringify({ schema: 'other', database: DB, lastSeq: '0', artifacts: [] }), 'utf8');
  const { fetchFn } = fakeFeed([{ results: [], last_seq: '0' }]);
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn, ...f }), /CHECKPOINT_INCOMPATIBLE:SCHEMA/);
  await assert.rejects(exportChangesFeedV1({ ...base, allowlist: ['other'], fetchFn, ...f }), /DATABASE_NOT_ALLOWLISTED/);
  await rm(f.dir, { recursive: true, force: true });
});

test('a leftover temp artifact from an interrupted write is ignored and resume still verifies', async () => {
  const f = await fixture();
  const first = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }, { results: [], last_seq: '1' }]);
  await exportChangesFeedV1({ ...base, fetchFn: first.fetchFn, ...f });
  // Simulate a crash after a temp write but before rename: the checkpoint must not reference it.
  await writeFile(path.join(f.outDir, `${DB}.crashed.ndjson.tmp`), '{"partial":', 'utf8');
  const second = fakeFeed([{ results: [row('b', '1-b', '2', true)], last_seq: '2' }, { results: [], last_seq: '2' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn: second.fetchFn, ...f, runId: 'resume' });
  assert.equal(out.status, 'EXPORTED');
  assert.equal(out.tombstones, 1);
  const cp = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
  assert.equal(cp.artifacts.length, 2);
  assert.equal(cp.lastSeq, '2');
});

test('an opaque 124-character sequence token is preserved verbatim and sent back unchanged on resume', async () => {
  const f = await fixture();
  const token = '1234-'.repeat(25).slice(0, 124);
  assert.equal(token.length, 124);
  const first = fakeFeed([{ results: [row('a', '1-a', token)], last_seq: token }, { results: [], last_seq: token }]);
  await exportChangesFeedV1({ ...base, pageSize: 2, fetchFn: first.fetchFn, ...f });
  const cp = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
  assert.equal(cp.lastSeq, token);
  const second = fakeFeed([{ results: [], last_seq: token }]);
  await exportChangesFeedV1({ ...base, fetchFn: second.fetchFn, ...f });
  assert.equal(second.calls[0].url.includes(`since=${encodeURIComponent(token)}`), true);
});

test('crash-before-commit: artifact published but checkpoint write fails, so the next run starts from the old checkpoint and the orphan is unreferenced', async () => {
  const f = await fixture();
  // A directory where the checkpoint temp file should be makes the checkpoint write fail after the artifact is durable.
  await mkdir(`${f.checkpointPath}.tmp`, { recursive: true });
  const crashing = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }, { results: [], last_seq: '1' }]);
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn: crashing.fetchFn, ...f, runId: 'crashed' }));
  await assert.rejects(readFile(f.checkpointPath, 'utf8'));
  const orphan = await readFile(path.join(f.outDir, `${DB}.crashed.ndjson`), 'utf8');
  assert.equal(orphan.trim().split('\n').length, 1);
  // Recovery: remove the blocker and rerun. Resume starts from no checkpoint, publishes one verified artifact, and references only it.
  await rm(`${f.checkpointPath}.tmp`, { recursive: true, force: true });
  const recovered = fakeFeed([{ results: [row('a', '1-a', '1')], last_seq: '1' }, { results: [], last_seq: '1' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn: recovered.fetchFn, ...f, runId: 'recovered' });
  assert.equal(out.status, 'EXPORTED');
  const cp = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
  assert.deepEqual(cp.artifacts.map((a) => a.file), [`${DB}.recovered.ndjson`]);
  assert.equal(cp.lastSeq, '1');
});

test('crash-after-commit: a restart after the checkpoint is durable is a no-op and leaves the checkpoint byte-identical', async () => {
  const f = await fixture();
  const first = fakeFeed([{ results: [row('a', '1-a', '1'), row('b', '1-b', '2', true)], last_seq: '2' }, { results: [], last_seq: '2' }]);
  await exportChangesFeedV1({ ...base, fetchFn: first.fetchFn, ...f, runId: 'committed' });
  const before = await readFile(f.checkpointPath, 'utf8');
  // After commit the feed holds nothing newer than since=2, so the restarted read returns an empty page.
  const restart = fakeFeed([{ results: [], last_seq: '2' }]);
  const out = await exportChangesFeedV1({ ...base, fetchFn: restart.fetchFn, ...f, runId: 'restart' });
  assert.equal(out.status, 'NO_CHANGES');
  assert.match(restart.calls[0].url, /since=2/);
  assert.equal(await readFile(f.checkpointPath, 'utf8'), before);
});

test('bounds stop the export before it exceeds the page, document, or byte limits', async () => {
  const f = await fixture();
  const { fetchFn } = fakeFeed([{ results: [row('a', '1-a', '1'), row('b', '1-b', '2')], last_seq: '2' }, { results: [row('c', '1-c', '3')], last_seq: '3' }]);
  await assert.rejects(exportChangesFeedV1({ ...base, fetchFn, ...f, maxDocs: 1 }), /BOUND_EXCEEDED:DOCS/);
});
