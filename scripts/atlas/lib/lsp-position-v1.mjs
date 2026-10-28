/**
 * LSP position -> UTF-8 byte offset conversion (pure). Works on the ORIGINAL bytes, never on re-encoded text.
 * Position encodings follow LSP 3.17 `positionEncoding`: 'utf-16' (default), 'utf-8', 'utf-32'.
 * A leading UTF-8 BOM is not part of the document text, so line 0 starts after it; byte offsets returned are absolute file offsets.
 * Line terminators: \r\n, \n, \r. Failures are typed, never clamped.
 */
export class LspPositionError extends Error {
  constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}
const ENCODINGS = ['utf-16', 'utf-8', 'utf-32'];
const decoder = new TextDecoder('utf-8', { fatal: true });

export function buildLineIndex(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new LspPositionError('BYTES_REQUIRED');
  const bomLength = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const lines = []; let start = bomLength;
  for (let i = bomLength; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a) { lines.push({ start, end: i }); start = i + 1; }
    else if (b === 0x0d) { lines.push({ start, end: i }); if (bytes[i + 1] === 0x0a) i++; start = i + 1; }
  }
  lines.push({ start, end: bytes.length });
  return { bytes, bomLength, lines };
}

export function positionToByteOffset(index, { line, character }, encoding = 'utf-16') {
  if (!ENCODINGS.includes(encoding)) throw new LspPositionError('ENCODING_UNSUPPORTED', String(encoding));
  if (!Number.isInteger(line) || line < 0 || line >= index.lines.length) throw new LspPositionError('LINE_OUT_OF_RANGE', String(line));
  if (!Number.isInteger(character) || character < 0) throw new LspPositionError('COLUMN_INVALID', String(character));
  const { start, end } = index.lines[line];
  if (encoding === 'utf-8') {
    if (character > end - start) throw new LspPositionError('COLUMN_OUT_OF_RANGE');
    const offset = start + character;
    if (offset < end && (index.bytes[offset] & 0xc0) === 0x80) throw new LspPositionError('SPLIT_CODE_POINT');
    try { decoder.decode(index.bytes.subarray(start, end)); } catch { throw new LspPositionError('INVALID_UTF8'); }
    return offset;
  }
  let text;
  try { text = decoder.decode(index.bytes.subarray(start, end)); } catch { throw new LspPositionError('INVALID_UTF8'); }
  let units = 0; let bytesSoFar = 0;
  if (character === 0) return start;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const width = encoding === 'utf-16' ? (cp > 0xffff ? 2 : 1) : 1;
    if (units + width > character && units < character) throw new LspPositionError('SPLIT_CODE_POINT', `inside U+${cp.toString(16).toUpperCase()}`);
    units += width;
    bytesSoFar += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (units === character) return start + bytesSoFar;
  }
  throw new LspPositionError('COLUMN_OUT_OF_RANGE');
}

export function byteOffsetToPosition(index, offset, encoding = 'utf-16') {
  if (!ENCODINGS.includes(encoding)) throw new LspPositionError('ENCODING_UNSUPPORTED', String(encoding));
  if (!Number.isInteger(offset) || offset < index.bomLength || offset > index.bytes.length) throw new LspPositionError('OFFSET_OUT_OF_RANGE');
  let line = index.lines.findIndex((l, i) => offset >= l.start && (offset <= l.end || i === index.lines.length - 1));
  if (line < 0) throw new LspPositionError('OFFSET_IN_LINE_TERMINATOR');
  const { start, end } = index.lines[line];
  if (offset > end) throw new LspPositionError('OFFSET_IN_LINE_TERMINATOR');
  if (encoding === 'utf-8') {
    if (offset < end && (index.bytes[offset] & 0xc0) === 0x80) throw new LspPositionError('SPLIT_CODE_POINT');
    return { line, character: offset - start };
  }
  let text;
  try { text = decoder.decode(index.bytes.subarray(start, end)); } catch { throw new LspPositionError('INVALID_UTF8'); }
  let bytesSoFar = 0; let units = 0;
  if (offset === start) return { line, character: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    bytesSoFar += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    units += encoding === 'utf-16' ? (cp > 0xffff ? 2 : 1) : 1;
    if (start + bytesSoFar === offset) return { line, character: units };
    if (start + bytesSoFar > offset) throw new LspPositionError('SPLIT_CODE_POINT');
  }
  throw new LspPositionError('OFFSET_OUT_OF_RANGE');
}

/** Converts an LSP range and verifies it against the frozen bytes. `expectedText` is optional but required for evidence use. */
export function rangeToVerifiedByteSpan(index, range, { encoding = 'utf-16', expectedText = null, documentVersion = null, snapshotVersion = null, normalizeLineEndings = false } = {}) {
  if (documentVersion !== null && snapshotVersion !== null && documentVersion !== snapshotVersion) throw new LspPositionError('STALE_DOCUMENT_VERSION', `${documentVersion}!=${snapshotVersion}`);
  const startByte = positionToByteOffset(index, range.start, encoding);
  const endByte = positionToByteOffset(index, range.end, encoding);
  if (endByte < startByte) throw new LspPositionError('RANGE_INVERTED');
  const text = decoder.decode(index.bytes.subarray(startByte, endByte));
  // Some producers (e.g. the :8095 sidecar) return evidence text with CRLF/CR folded to LF while the span still addresses the original bytes.
  // That is accepted only when asked for, and reported, never silently.
  const fold = (value) => value.replace(/\r\n?/g, '\n');
  const exact = expectedText !== null && text === expectedText;
  const folded = expectedText !== null && !exact && normalizeLineEndings && fold(text) === fold(expectedText);
  if (expectedText !== null && !exact && !folded) throw new LspPositionError('SPAN_READBACK_MISMATCH', JSON.stringify({ expected: expectedText, actual: text }).slice(0, 160));
  return { startByte, endByte, text, readbackVerified: expectedText !== null, lineEndingNormalized: folded };
}
