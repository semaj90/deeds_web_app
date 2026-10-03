import { createHash } from 'node:crypto';

const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_BATCH_RECORDS = 256;
const HARD_MAX_LINE_BYTES = 4 *  1024 * 1024;
const HARD_MAX_BATCH_RECORDS = 2_000;

/**
 * Stream object-valued JSONL records in bounded batches. Input bytes are framed before UTF-8
 * decoding so a single oversized line is rejected without buffering the rest of the file.
 * This is a transport/parser helper only: it performs no classification or datastore writes.
 */
export async function* streamJsonlBatchesV1(readable, {
  maxLineBytes = DEFAULT_MAX_LINE_BYTES,
  batchRecords = DEFAULT_BATCH_RECORDS,
} = {}) {
  if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('JSONL_INPUT_MUST_BE_ASYNC_ITERABLE');
  }
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1 || maxLineBytes > HARD_MAX_LINE_BYTES) {
    throw new RangeError('JSONL_MAX_LINE_BYTES_INVALID');
  }
  if (!Number.isSafeInteger(batchRecords) || batchRecords < 1 || batchRecords > HARD_MAX_BATCH_RECORDS) {
    throw new RangeError('JSONL_BATCH_RECORDS_INVALID');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = [];
  let pendingBytes = 0;
  let batch = [];
  let batchHash = createHash('sha256');
  let lineNumber = 0;
  let batchFirstLine = 0;

  function appendPending(segment) {
    if (segment.length === 0) return;
    pending.push(segment);
    pendingBytes += segment.length;
    // Bound fragment-object overhead even if an async source yields one byte at a time.
    if (pending.length >= 128) pending = [Buffer.concat(pending, pendingBytes)];
  }

  function parseLine(lineBytes) {
    lineNumber += 1;
    const hasCr = lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 13;
    const body = hasCr ? lineBytes.subarray(0, lineBytes.length - 1) : lineBytes;
    if (body.length > maxLineBytes) throw new Error(`JSONL_LINE_TOO_LARGE:${lineNumber}:${body.length}:${maxLineBytes}`);
    if (body.length === 0) return null;
    let text;
    try { text = decoder.decode(body); }
    catch { throw new Error(`JSONL_INVALID_UTF8:${lineNumber}`); }
    let value;
    try { value = JSON.parse(text); }
    catch (error) { throw new Error(`JSONL_INVALID_JSON:${lineNumber}:${error instanceof Error ? error.message : String(error)}`); }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`JSONL_RECORD_MUST_BE_OBJECT:${lineNumber}`);
    }
    return { value, raw: body };
  }

  function addLine(lineBytes) {
    const parsed = parseLine(lineBytes);
    if (!parsed) return null;
    if (batch.length === 0) batchFirstLine = lineNumber;
    batch.push(parsed.value);
    batchHash.update(parsed.raw);
    batchHash.update('\n');
    if (batch.length < batchRecords) return null;
    const result = {
      schema: 'atlas.jsonl-record-batch.v1',
      batchIndex: 0,
      firstLine: batchFirstLine,
      lastLine: lineNumber,
      recordCount: batch.length,
      checksum: `sha256:${batchHash.digest('hex')}`,
      records: batch,
    };
    batch = [];
    batchHash = createHash('sha256');
    return result;
  }

  // This internal queue contains at most one source chunk plus a bounded partial record.
  // A yielded batch is capped by batchRecords; callers control downstream backpressure by
  // requesting the next item only after processing the current one.
  let batchIndex = 0;
  for await (const inputChunk of readable) {
    const chunk = Buffer.isBuffer(inputChunk) ? inputChunk : Buffer.from(inputChunk);
    let start = 0;
    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] !== 10) continue;
      const segment = chunk.subarray(start, i);
      const fullLength = pendingBytes + segment.length;
      const lineParts = pending.length ? [...pending, segment] : [segment];
      const lineBytes = lineParts.length === 1 ? lineParts[0] : Buffer.concat(lineParts, fullLength);
      pending = [];
      pendingBytes = 0;
      const output = addLine(lineBytes);
      if (output) yield { ...output, batchIndex: batchIndex++ };
      start = i + 1;
    }
    if (start < chunk.length) {
      const segment = chunk.subarray(start);
      appendPending(segment);
      if (pendingBytes > maxLineBytes + 1) {
        throw new Error(`JSONL_LINE_TOO_LARGE:${lineNumber + 1}:${pendingBytes}:${maxLineBytes}`);
      }
    }
  }

  if (pendingBytes > 0) {
    const lineBytes = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingBytes);
    const output = addLine(lineBytes);
    if (output) yield { ...output, batchIndex: batchIndex++ };
  }
  if (batch.length > 0) {
    yield {
      schema: 'atlas.jsonl-record-batch.v1',
      batchIndex,
      firstLine: batchFirstLine,
      lastLine: lineNumber,
      recordCount: batch.length,
      checksum: `sha256:${batchHash.digest('hex')}`,
      records: batch,
    };
  }
}
