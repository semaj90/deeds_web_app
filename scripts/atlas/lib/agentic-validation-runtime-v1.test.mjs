import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoCommittedMcpWritesV1,
  buildAgenticValidationReceiptV1,
  classifyAgenticRuntimeStatusV1,
  extractMcpTextV1,
  parseMcpResponseV1,
  validateMiniforgeHealthV1,
} from './agentic-validation-runtime-v1.mjs';

test('parses JSON-RPC responses from SSE and JSON transports', () => {
  const payload = { jsonrpc: '2.0', id: 1, result: { content: [] } };
  assert.deepEqual(parseMcpResponseV1(`event: message\ndata: ${JSON.stringify(payload)}\n\n`), payload);
  assert.deepEqual(parseMcpResponseV1(JSON.stringify(payload)), payload);
});

test('rejects malformed MCP envelopes and tool errors', () => {
  assert.throws(() => parseMcpResponseV1(''), /MCP_RESPONSE_EMPTY/);
  assert.throws(() => parseMcpResponseV1('event: message\ndata: [DONE]'), /MCP_RESPONSE_INVALID_JSON/);
  assert.throws(() => extractMcpTextV1({ isError: true, content: [] }), /MCP_TOOL_REPORTED_ERROR/);
  assert.throws(() => extractMcpTextV1({ content: [] }), /MCP_TOOL_TEXT_MISSING/);
});

test('accepts the live NLP health contract without requiring optional GPU libraries', () => {
  const health = validateMiniforgeHealthV1({
    status: 'success',
    ready: true,
    sidecar_url: 'http://127.0.0.1:8095',
    model: 'ornith-1.5-9b',
    capabilities: { langextract: true, networkx: true, torch: false, cugraph: false },
  });
  assert.equal(health.sidecarUrl, 'http://127.0.0.1:8095');
  assert.equal(health.capabilities.torch, false);
  assert.equal(validateMiniforgeHealthV1({ status: 'success', ready: true, sidecar_url: 'http://127.0.0.1:8095', capabilities: null }).capabilities, null);
  assert.throws(() => validateMiniforgeHealthV1({ ...{ status: 'success', ready: true, sidecar_url: 'http://127.0.0.1:8090', capabilities: {} } }), /MINIFORGE_SIDECAR_PORT_MISMATCH/);
  assert.throws(() => validateMiniforgeHealthV1({ status: 'success', ready: false, sidecar_url: 'http://127.0.0.1:8095', capabilities: {} }), /MINIFORGE_NLP_NOT_READY/);
});

test('requires a read-only side-effect receipt with zero committed writes', () => {
  assert.deepEqual(assertNoCommittedMcpWritesV1({
    read_only_side_effect_receipt: { executionMode: 'READ_ONLY', attemptedWrites: 3, committedWrites: 0 },
  }), { attemptedWrites: 3, committedWrites: 0 });
  assert.throws(() => assertNoCommittedMcpWritesV1({
    read_only_side_effect_receipt: { executionMode: 'READ_ONLY', attemptedWrites: 1, committedWrites: 1 },
  }), /MCP_COMMITTED_WRITES_DETECTED/);
  assert.throws(() => assertNoCommittedMcpWritesV1({}), /READ_ONLY_SIDE_EFFECT_RECEIPT_MISSING/);
});

test('builds a non-authoritative live validation receipt with review status kept separate', () => {
  const receipt = buildAgenticValidationReceiptV1({
    traceUrl: 'http://127.0.0.1:8788',
    retrievalHits: 3,
    readOnlyEffects: { attemptedWrites: 0, committedWrites: 0 },
    health: {
      sidecarUrl: 'http://127.0.0.1:8095',
      model: 'ornith-1.5-9b',
      capabilities: { langextract: true, networkx: true, torch: false },
    },
  });
  assert.equal(receipt.traceMcp.status, 'LIVE_VERIFIED');
  assert.equal(receipt.nlpSidecar.status, 'LIVE_VERIFIED');
  assert.equal(receipt.nlpSidecar.capabilitiesStatus, 'LIVE_VERIFIED');
  assert.equal(receipt.review.status, 'ADVISORY_ONLY');
  assert.equal(receipt.review.humanApproval, 'NOT_GRANTED');
  assert.equal(receipt.canonicalAuthority, false);
  assert.equal(receipt.effects.committedWrites, 0);
});

test('keeps sidecar health live while marking absent capability detail blocked', () => {
  const receipt = buildAgenticValidationReceiptV1({
    traceUrl: 'http://127.0.0.1:8788',
    retrievalHits: 0,
    readOnlyEffects: { attemptedWrites: 0, committedWrites: 0 },
    health: { sidecarUrl: 'http://127.0.0.1:8095', model: null, capabilities: null },
  });
  assert.equal(receipt.nlpSidecar.status, 'LIVE_VERIFIED');
  assert.equal(receipt.nlpSidecar.capabilitiesStatus, 'BLOCKED');
  assert.equal(receipt.nlpSidecar.capabilitiesBlocker, 'CAPABILITIES_NOT_RETURNED');
});

test('keeps configured, live, mock, failure, blocked, and unrun statuses distinct', () => {
  assert.equal(classifyAgenticRuntimeStatusV1({ configured: true }), 'CONFIGURED');
  assert.equal(classifyAgenticRuntimeStatusV1({ configured: true, liveVerified: true }), 'LIVE_VERIFIED');
  assert.equal(classifyAgenticRuntimeStatusV1({ mockOnly: true }), 'MOCK_ONLY');
  assert.equal(classifyAgenticRuntimeStatusV1({ failed: true }), 'FAIL');
  assert.equal(classifyAgenticRuntimeStatusV1({ blocked: true }), 'BLOCKED');
  assert.equal(classifyAgenticRuntimeStatusV1(), 'NOT_RUN');
});

test('rejects validation receipts with wrong endpoints, invalid counts, or writes', () => {
  const valid = {
    traceUrl: 'http://127.0.0.1:8788',
    retrievalHits: 0,
    readOnlyEffects: { attemptedWrites: 0, committedWrites: 0 },
    health: { sidecarUrl: 'http://127.0.0.1:8095', model: null, capabilities: null },
  };
  assert.throws(() => buildAgenticValidationReceiptV1({ ...valid, traceUrl: 'http://127.0.0.1:8789' }), /TRACE_MCP_PORT_MISMATCH/);
  assert.throws(() => buildAgenticValidationReceiptV1({ ...valid, retrievalHits: -1 }), /TRACE_RETRIEVAL_HIT_COUNT_INVALID/);
  assert.throws(() => buildAgenticValidationReceiptV1({ ...valid, readOnlyEffects: { committedWrites: 1 } }), /MCP_COMMITTED_WRITES_DETECTED/);
  assert.throws(() => buildAgenticValidationReceiptV1({ ...valid, health: { ...valid.health, sidecarUrl: 'http://127.0.0.1:8090' } }), /MINIFORGE_SIDECAR_PORT_MISMATCH/);
});
