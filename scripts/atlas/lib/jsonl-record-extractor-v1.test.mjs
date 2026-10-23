import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSourceTextEnvelope } from './source-text-envelope.mjs';
import { extractJsonlRecordNodesV1 } from './jsonl-record-extractor-v1.mjs';

test('extracts bounded JSONL document records with exact UTF-8 and CRLF source spans', async () => {
  const raw = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('{"name":"café 😀"}\r\n\r\n{"id":2}', 'utf8'),
  ]);
  const envelope = decodeSourceTextEnvelope(raw, 'events.jsonl');
  const nodes = await extractJsonlRecordNodesV1(envelope, { batchRecords: 1 });
  assert.deepEqual(nodes.map(node => [node.name, node.start_line, node.end_line]), [
    ['line-1', 1, 1], ['line-3', 3, 3],
  ]);
  assert.equal(raw.subarray(nodes[0].start_byte, nodes[0].end_byte).toString('utf8'), '{"name":"café 😀"}');
  assert.equal(raw.subarray(nodes[1].start_byte, nodes[1].end_byte).toString('utf8'), '{"id":2}');
  assert.ok(nodes.every(node => node.kind === 'record' && node.parent_chain.length === 0));
});

test('rejects malformed JSON, non-object records, invalid UTF-8 and oversized lines', async () => {
  const envelope = text => decodeSourceTextEnvelope(Buffer.from(text), 'events.ndjson');
  await assert.rejects(() => extractJsonlRecordNodesV1(envelope('{"a":}\n')), /JSONL_INVALID_JSON:1/);
  await assert.rejects(() => extractJsonlRecordNodesV1(envelope('[1,2]\n')), /JSONL_RECORD_MUST_BE_OBJECT:1/);
  assert.throws(() => decodeSourceTextEnvelope(Buffer.from([0xff, 10]), 'events.jsonl'),
    /SOURCE_TEXT_ENVELOPE_MALFORMED_UTF8/);
  await assert.rejects(() => extractJsonlRecordNodesV1(envelope('{"long":"123456"}\n'), { maxLineBytes: 8 }), /JSONL_LINE_TOO_LARGE/);
});

test('enforces record and source budgets without returning partial results', async () => {
  const envelope = decodeSourceTextEnvelope(Buffer.from('{}\n{}\n'), 'events.jsonl');
  await assert.rejects(() => extractJsonlRecordNodesV1(envelope, { maxRecords: 1 }), /JSONL_RECORD_LIMIT_EXCEEDED/);
  await assert.rejects(() => extractJsonlRecordNodesV1(envelope, { maxSourceBytes: 1 }), /JSONL_SOURCE_LIMIT_INVALID/);
});
