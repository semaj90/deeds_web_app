import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReceipt } from '../deep-audit-hll-telemetry-v1.mts';
import { runTelemetryConsumer, validateReceiptFile } from './deep-audit-telemetry-receipt-v1.mts';

const dir = mkdtempSync(path.join(tmpdir(), 'dat-receipt-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const graph = {
  files: [
    { rel: 'sveltekit-frontend/src/routes/api/a/+server.ts', hasAuth: false, hasPairedTest: true, hasZod: true, parsesBody: true },
    { rel: 'sveltekit-frontend/src/routes/api/b/+server.ts', hasAuth: true, hasPairedTest: false, hasZod: false, parsesBody: true },
    { rel: 'sveltekit-frontend/src/lib/c.ts' },
  ],
};
const graphRaw = JSON.stringify(graph);

test('codebase graph serializer preserves parsesBody for G5', () => {
  const source = readFileSync(path.resolve('sveltekit-frontend/scripts/index-codebase-fast.mjs'), 'utf8');
  assert.match(source, /hasAuth:\s*f\.hasAuth,\s*hasZod:\s*f\.hasZod,\s*parsesBody:\s*f\.parsesBody/);
  const serialized = JSON.parse(graphRaw) as typeof graph;
  assert.equal(serialized.files[1].parsesBody, true);
});

/** Write a receipt built by the real writer function into the temp dir, optionally mutated. */
async function writerReceipt(mutate?: (r: Record<string, unknown>) => void, name = 'telemetry-2026-10-21-aaaaaaaaaa.json') {
  const { receipt } = await buildReceipt(graphRaw, 'fixture-graph.json', '2026-10-21');
  const copy = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  mutate?.(copy);
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(copy, null, 2));
  return file;
}

test('writer output passes the shared consumer (writer-to-consumer boundary)', async () => {
  const file = await writerReceipt();
  const r = runTelemetryConsumer([file]);
  assert.equal(r.exitCode, 0);
  assert.equal(r.receipts[0].result.ok, true);
});

test('deterministic aggregate counts on the same frozen graph', async () => {
  const a = await buildReceipt(graphRaw, 'g.json', '2026-10-21');
  const b = await buildReceipt(graphRaw, 'g.json', '2026-10-21');
  assert.deepEqual(a.receipt.distinctCounts, b.receipt.distinctCounts);
  assert.deepEqual(a.receipt.distinctCounts, { files_scanned: 3, server_routes: 2, routes_without_auth: 1, routes_without_test: 1, body_parsers_without_zod: 1 });
});

test('impossible calendar date is blocked', async () => {
  const file = await writerReceipt((r) => { r.windowId = '2026-02-30'; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('bad namespace is blocked', async () => {
  const file = await writerReceipt((r) => { r.namespace = 'Deep Audit!'; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('malformed graph hash is blocked', async () => {
  const file = await writerReceipt((r) => { r.graphSha256 = 'ABC'; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('negative count is blocked', async () => {
  const file = await writerReceipt((r) => { (r.distinctCounts as Record<string, number>).files_scanned = -1; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('unexpected field is blocked (strict object)', async () => {
  const file = await writerReceipt((r) => { r.extraSecret = 'x'; });
  const result = validateReceiptFile(file);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /RECEIPT_INVALID/);
});

test('a data-store write flag set to true is blocked', async () => {
  const file = await writerReceipt((r) => { (r.writesPerformed as Record<string, unknown>).valkey = true; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('canonical authority set to true is blocked', async () => {
  const file = await writerReceipt((r) => { r.canonicalAuthority = true; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('a receipt that lists two created files is blocked', async () => {
  const file = await writerReceipt((r) => { r.receiptFilesCreated = ['telemetry-2026-10-21-aaaaaaaaaa.json', 'telemetry-2026-10-21-bbbbbbbbbb.json']; });
  assert.equal(runTelemetryConsumer([file]).exitCode, 1);
});

test('missing receipt is blocked with a typed reason', () => {
  const result = validateReceiptFile(path.join(dir, 'does-not-exist.json'));
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /^RECEIPT_MISSING:ENOENT$/);
});

test('no receipts named is blocked (never a silent pass)', () => {
  assert.equal(runTelemetryConsumer([]).exitCode, 1);
});

test('a failing receipt is not replaced by a passing one', async () => {
  const bad = await writerReceipt((r) => { r.windowId = '2026-13-01'; }, 'telemetry-2026-10-21-cccccccccc.json');
  const good = await writerReceipt(undefined, 'telemetry-2026-10-21-dddddddddd.json');
  const r = runTelemetryConsumer([bad]);
  assert.equal(r.exitCode, 1, 'the bad receipt alone must block; the good one is never substituted');
  assert.equal(runTelemetryConsumer([bad, good]).exitCode, 1, 'one failing receipt blocks the whole set');
});
