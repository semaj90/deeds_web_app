import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGpuVramHandlers, dispatch, gpuRequestVramRelease, validateToolCallArguments } from './atlas-tools-mcp.mjs';

const validRequest = (overrides = {}) => ({
  requestId: 'fixture-request-0001',
  reason: 'Need memory for isolated CPU/GPU parity rehearsal',
  neededMiB: 1024,
  ...overrides,
});

test('registered atlas-tools surface exposes status and request-only VRAM tools', async () => {
  const listed = await dispatch('tools/list', {}, 1);
  const tools = new Map(listed.tools.map((tool) => [tool.name, tool]));
  assert.ok(tools.has('gpu_vram_status'));
  assert.ok(tools.has('gpu_request_vram_release'));
  assert.deepEqual(tools.get('gpu_vram_status').inputSchema.properties, {});
  assert.deepEqual(tools.get('gpu_request_vram_release').inputSchema.required, ['reason', 'neededMiB']);
  assert.equal(tools.get('gpu_request_vram_release').inputSchema.additionalProperties, false);
});

test('isolated request writes a complete test-only record and an idempotent replay adds no line', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gpu-request-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const requestPath = path.join(tempDir, 'requests.ndjson');
  const handlers = createGpuVramHandlers({
    requestPath,
    now: () => new Date('2026-11-09T12:34:56.000Z'),
    makeRequestId: () => 'generated-id-unused',
    testOnly: true,
    readVram: () => { throw new Error('status probe must not run during request recording'); },
    readSlots: async () => { throw new Error('slot probe must not run during request recording'); },
  });
  const args = validRequest();
  assert.equal(validateToolCallArguments('gpu_request_vram_release', args).valid, true);

  const first = handlers.gpuRequestVramRelease(args);
  const replay = handlers.gpuRequestVramRelease(args);
  const lines = fs.readFileSync(requestPath, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const stored = JSON.parse(lines[0]);
  assert.deepEqual(stored, {
    schema: 'atlas.gpu-vram-release-request.v1',
    requestId: 'fixture-request-0001',
    requestedAt: '2026-11-09T12:34:56.000Z',
    actorContext: {
      actor: 'mcp-client',
      authenticated: false,
      principal: null,
      authorizationScope: 'request-only',
    },
    operation: 'request_vram_release',
    targetScope: { service: 'llama-server', port: 8090 },
    reason: args.reason,
    neededMiB: 1024,
    status: 'PENDING_HUMAN',
    testOnly: true,
    writesPerformed: true,
  });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.requestId, first.requestId);
  assert.equal(replay.requestedAt, first.requestedAt);
  assert.equal(first.processStopped, false);
  assert.equal(first.canonicalAuthority, false);
});

test('normal request records do not include a test-only field', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gpu-request-production-shape-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const requestPath = path.join(tempDir, 'requests.ndjson');
  const result = gpuRequestVramRelease(validRequest(), requestPath);
  const stored = JSON.parse(fs.readFileSync(requestPath, 'utf8').trim());
  assert.equal(Object.hasOwn(stored, 'testOnly'), false);
  assert.equal(result.requestId, 'fixture-request-0001');
  assert.equal(result.writesPerformed, true);
});

test('concurrent isolated requests remain one valid JSON object per line', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gpu-request-concurrent-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const requestPath = path.join(tempDir, 'requests.ndjson');
  const handlers = createGpuVramHandlers({
    requestPath,
    now: () => new Date('2026-11-09T12:34:56.000Z'),
    testOnly: true,
  });
  const results = Array.from({ length: 48 }, (_, i) => handlers.gpuRequestVramRelease(validRequest({
    requestId: `concurrent-${i}`,
    reason: `fixture request ${i}`,
  })));
  assert.equal(results.length, 48);
  const lines = fs.readFileSync(requestPath, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 48);
  const records = lines.map((line) => JSON.parse(line));
  assert.equal(new Set(records.map((record) => record.requestId)).size, 48);
  assert.ok(records.every((record) => record.testOnly === true && record.writesPerformed === true));
});

test('status uses injected read-only probes and reports no writes', async () => {
  let requestSinkCalls = 0;
  const handlers = createGpuVramHandlers({
    persistRequest: () => { requestSinkCalls += 1; throw new Error('unexpected fixture write'); },
    readVram: () => ({ name: 'fixture-gpu', usedMiB: 100, totalMiB: 1000, freeMiB: 900 }),
    readSlots: async () => ({ reachable: true, slotCount: 2, allSlotsIdle: false }),
  });
  const result = await handlers.gpuVramStatus();
  assert.equal(result.vram.freeMiB, 900);
  assert.equal(result.llamaServer8090.allSlotsIdle, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(requestSinkCalls, 0);
});

test('GPU handlers contain no lifecycle, database, or cache control path', () => {
  const implementation = createGpuVramHandlers.toString();
  // The only external production probes are nvidia-smi query mode and HTTP GET /slots.
  assert.match(implementation, /execFileSync\(\s*'nvidia-smi'/);
  assert.match(implementation, /fetch\('http:\/\/127\.0\.0\.1:8090\/slots'/);
  assert.doesNotMatch(implementation, /\b(?:spawn|spawnSync|execSync|docker|kill|stopProcess|unloadModel)\s*\(/i);
  assert.doesNotMatch(implementation, /\b(?:pg|redis|valkey|neo4j)\s*\./i);
  assert.doesNotMatch(implementation, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});

test('request schema rejects credentials and lifecycle controls before dispatch', async () => {
  const forbiddenFields = [
    { operator_token: '' },
    { operator_token: 'fake-token' },
    { authorizationScope: 'gpu:release' },
    { busySlot: true },
    { pid: 1234 },
    { executable: 'llama-server.exe' },
    { lease_id: 'stale-lease' },
    { operation: 'stop_process' },
  ];
  for (const extra of forbiddenFields) {
    const args = validRequest(extra);
    assert.equal(validateToolCallArguments('gpu_request_vram_release', args).valid, false);
  }
});

test('reusing a request ID with changed reason or memory demand is rejected without appending', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gpu-request-collision-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  for (const [index, changedPayload] of [
    { reason: 'A different reason for this request' },
    { neededMiB: 2048 },
  ].entries()) {
    const requestPath = path.join(tempDir, `requests-${index}.ndjson`);
    const handlers = createGpuVramHandlers({ requestPath, testOnly: true });
    handlers.gpuRequestVramRelease(validRequest());
    assert.throws(
      () => handlers.gpuRequestVramRelease(validRequest(changedPayload)),
      /GPU_REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD/,
    );
    assert.equal(fs.readFileSync(requestPath, 'utf8').trim().split(/\r?\n/).length, 1);
  }
});
