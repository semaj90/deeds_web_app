import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { streamJsonlBatchesV1 } from './stream-jsonl-batches-v1.mjs';
import { JSON_SOURCE_SHAPE_POLICY_V1 } from './json-source-shape-policy-v1.mjs';
import { decodedOffsetToRawByte } from './source-text-envelope.mjs';

function decodeUtf8Segment(buffer) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) throw new Error('JSONL_SPAN_INVALID_UTF8');
  return text;
}

async function* bufferChunks(buffer, chunkSize) {
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    yield buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
  }
}

export async function extractJsonlRecordNodesV1(envelope, {
  maxSourceBytes = JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes,
  maxRecords = JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile,
  maxLineBytes = 1024 * 1024,
  batchRecords = 128,
} = {}) {
  if (!envelope || typeof envelope.text !== 'string' || !Buffer.isBuffer(envelope.parserBuffer)
    || envelope.parserBuffer.toString('utf8') !== envelope.text) {
    throw new TypeError('JSONL_SOURCE_ENVELOPE_INVALID');
  }
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1
    || envelope.parserBuffer.length > maxSourceBytes
    || !Number.isSafeInteger(maxRecords) || maxRecords < 1
    || maxRecords > JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile) {
    throw new RangeError('JSONL_SOURCE_LIMIT_INVALID');
  }

  const nodes = [];
  let byteCursor = 0;
  let decodedCursor = 0;
  for await (const batch of streamJsonlBatchesV1(bufferChunks(envelope.parserBuffer, 64 * 1024), {
    maxLineBytes,
    batchRecords,
    includeSpans: true,
  })) {
    for (const span of batch.recordSpans) {
      if (nodes.length >= maxRecords) throw new Error('JSONL_RECORD_LIMIT_EXCEEDED');
      const gapText = decodeUtf8Segment(envelope.parserBuffer.subarray(byteCursor, span.startByte));
      const startOffset = decodedCursor + gapText.length;
      const recordText = decodeUtf8Segment(envelope.parserBuffer.subarray(span.startByte, span.endByte));
      const endOffset = startOffset + recordText.length;
      const fingerprint = createHash('sha256').update(Buffer.from(recordText, 'utf8')).digest('hex');
      nodes.push({
        kind: 'record',
        name: `line-${span.lineNumber}`,
        start_line: span.lineNumber,
        end_line: span.lineNumber,
        start_byte: decodedOffsetToRawByte(envelope, startOffset),
        end_byte: decodedOffsetToRawByte(envelope, endOffset),
        signature_text: recordText.slice(0, 400),
        hash: fingerprint.slice(0, 12),
        ast_fingerprint: fingerprint,
        parent_chain: [],
      });
      byteCursor = span.endByte;
      decodedCursor = endOffset;
    }
  }
  return nodes;
}
