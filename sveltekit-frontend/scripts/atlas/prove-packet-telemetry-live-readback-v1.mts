import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: [resolve('.env.local'), resolve('.env')], quiet: true });
const approved = process.argv.includes('--approved-one-insert');
assert(approved || process.argv.includes('--preflight'), 'Explicit preflight or approved-one-insert flag required');
const reportRoot = resolve('../docs/reports');
const approvalMarker = resolve(reportRoot, 'parent-atlas-telemetry-live-approval-20261016.json');
assert(!approved || !existsSync(approvalMarker), 'Approval already consumed; do not retry an uncertain insert');

const { ENV } = await import('../../src/lib/server/env.server.js');
const { pool, closeConnections } = await import('../../src/lib/server/db/client.js');
const reader = new pg.Client({ connectionString: ENV.DATABASE_URL, statement_timeout: 5000 });
const traceId = `trace:telemetry-proof:${randomUUID()}`;
const report: Record<string, unknown> = { schema: 'atlas.telemetry-live-readback.v1', trace_id: traceId,
  status: 'PREFLIGHT', canonicalAuthority: false, sourceWritesPerformed: false, modelLoadsPerformed: false,
  likely_cause: 'Live existing-writer insert and independent readback were not yet proven.',
  evidence: [], patch_targets: ['sveltekit-frontend/scripts/atlas/prove-packet-telemetry-live-readback-v1.mts'],
  safe_next_command: 'Review this receipt; do not repeat the approved insert.',
  smoke_command: 'npx tsx scripts/atlas/prove-packet-telemetry-live-readback-v1.mts --preflight' };
try {
  await reader.connect();
  const metadata = await reader.query("SELECT current_database() AS database, current_setting('server_version') AS version, to_regclass('public.phase_2_telemetry') AS alternate_table, to_regclass('public.atlas_retrieval_eval_times') AS target_table");
  assert.equal(metadata.rows[0].database, 'legal_ai_db', 'Unexpected canonical database');
  assert.match(metadata.rows[0].version, /^18\./, 'PostgreSQL 18 required');
  assert.equal(metadata.rows[0].alternate_table, null, 'Approval covers eval table only; alternate writer target appeared');
  assert(metadata.rows[0].target_table, 'Existing eval table unavailable');
  report.database = { name: metadata.rows[0].database, version: metadata.rows[0].version };
  if (!approved) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_PASSED', database: report.database, writesPerformed: false }));
  } else {
    const { withPacketTelemetryContext } = await import('../../src/lib/server/telemetry/packet-telemetry-context.js');
    const { observeTransport, measureTransportCodec } = await import('../../src/lib/server/grpc/transport-telemetry.js');
    const { recordPacketCentricTelemetryAcknowledged } = await import('../../src/lib/server/telemetry/packet-centric-telemetry.js');
    const requestId = randomUUID();
    const started = performance.now();
    const response = await withPacketTelemetryContext({ trace_id: traceId }, () => observeTransport('http', async () => {
      const body = measureTransportCodec('json_stringify', () => JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'tools/call',
        params: { name: 'db.table_inspect', arguments: { schema: 'public', table: 'atlas_retrieval_eval_times',
          include_columns: true, include_indexes: false, include_foreign_keys: false } } }), (value) => Buffer.byteLength(value));
      const result = await fetch('http://127.0.0.1:8788/mcp', { method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body, signal: AbortSignal.timeout(15000) });
      assert(result.ok, 'Live MCP request failed');
      const raw = await result.text();
      assert(Buffer.byteLength(raw) < 2 * 1024 * 1024, 'Response exceeded proof bound');
      const data = raw.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim() ?? raw;
      const rpc = measureTransportCodec('json_parse', () => JSON.parse(data), () => Buffer.byteLength(data));
      assert.equal(rpc.id, requestId);
      assert(!rpc.error && !rpc.result?.isError, 'Live tool returned an error');
      const text = rpc.result?.content?.find((item: { type: string }) => item.type === 'text')?.text;
      assert.equal(typeof text, 'string');
      const table = measureTransportCodec('json_parse', () => JSON.parse(text), () => Buffer.byteLength(text));
      assert.equal(table.table, 'atlas_retrieval_eval_times');
      assert.equal(table.schema, 'public');
      assert(Array.isArray(table.columns) && table.columns.some((column: { name: string }) => column.name === 'payload'));
      return { columnCount: table.columns.length };
    }, 'mcp:db.table_inspect'));
    const durationMs = performance.now() - started;
    report.liveRequest = { tool: 'db.table_inspect', columnCount: response.columnCount, durationMs,
      transportTelemetry: response.transportTelemetry, packetQualification: 'UNKNOWN_DIAGNOSTIC_ONLY' };
    writeFileSync(approvalMarker, JSON.stringify({ schema: 'atlas.one-insert-approval.v1', trace_id: traceId,
      status: 'ATTEMPT_STARTED', approvedBy: 'operator', table: 'public.atlas_retrieval_eval_times',
      created_at: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
    report.approvalConsumed = true;
    const acknowledged = await recordPacketCentricTelemetryAcknowledged({ trace_id: traceId,
      surface: 'atlas.telemetry_live_readback', latency_ms: durationMs, transport_telemetry: response.transportTelemetry,
      packet_context: { packet_id: null, source_ref: null, feature_id: null, som_cell: null, rpc_transport: 'http' } });
    report.writerAcknowledged = acknowledged;
    await reader.query('BEGIN READ ONLY');
    const readback = await reader.query("SELECT id, packet_key, source_ref, protocol, payload FROM public.atlas_retrieval_eval_times WHERE payload->>'trace_id' = $1 LIMIT 2", [traceId]);
    await reader.query('COMMIT');
    report.readbackRows = readback.rowCount;
    assert.equal(readback.rowCount, 1, 'Expected exactly one row; never automatically retry this insert');
    const row = readback.rows[0];
    assert.equal(row.packet_key, null);
    assert.equal(row.source_ref, null);
    assert.equal(row.protocol, 'http');
    assert.equal(row.payload.trace_id, traceId);
    assert.deepEqual(row.payload.transport_telemetry, JSON.parse(JSON.stringify(response.transportTelemetry)));
    assert.equal(row.payload.packet_context.embedding_version, null);
    assert.equal(row.payload.packet_context.gpu_kernel_version, null);
    report.status = 'LIVE_DIAGNOSTIC_INSERT_READBACK_PROVEN';
    report.evidence = { rowId: row.id, readbackConnection: 'Independent pg.Client READ ONLY transaction',
      exactTransportPayloadMatch: true, packetIdentityInvented: false, httpVersion: null };
  }
} catch (error) {
  report.status = 'PARTIAL';
  report.failure = error instanceof Error ? error.name : 'UnknownError';
  console.error('Telemetry proof did not complete; inspect receipt. No automatic retry.');
  process.exitCode = 1;
} finally {
  await reader.end().catch(() => {});
  await closeConnections();
  if (approved) {
    const path = resolve(reportRoot, `parent-atlas-telemetry-live-readback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    report.report_path = path;
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: report.status, report_path: path, approvalConsumed: report.approvalConsumed ?? false }));
  }
}
