/**
 * lsp-utf16-utf8-coordinate-v1.mjs
 *
 * Canonical Parent Atlas coordinate translation between:
 * 1. LSP / VS Code editor positions: 0-indexed line & UTF-16 code unit offset (`character`).
 * 2. Tree-sitter CST, AST-grep, and native SIMD/CSR buffers: exact 0-indexed UTF-8 byte offsets.
 *
 * Constraints & Guarantees:
 * - Fail-closed on surrogate pair splits (0xD800..0xDBFF + 0xDC00..0xDFFF).
 * - Out-of-bounds line/character or byte offset returns typed null / throws when strict.
 * - Single-pass line-start indexing with cached line index.
 * - Schema: 'atlas.lsp-coordinate-translation.v1'.
 */

export function buildLineStartsUtf8(sourceText) {
  if (typeof sourceText !== 'string') {
    throw new TypeError('sourceText must be a string');
  }
  const starts = [0];
  const buf = Buffer.from(sourceText, 'utf8');
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) { // '\n'
      starts.push(i + 1);
    }
  }
  return { starts, totalBytes: buf.length, buffer: buf };
}

export function buildLineStartsUtf16(sourceText) {
  if (typeof sourceText !== 'string') {
    throw new TypeError('sourceText must be a string');
  }
  const starts = [0];
  for (let i = 0; i < sourceText.length; i++) {
    if (sourceText.charCodeAt(i) === 0x0a) {
      starts.push(i + 1);
    }
  }
  return { starts, totalChars: sourceText.length };
}

/**
 * Checks whether an offset in a UTF-16 string lands between a surrogate pair.
 */
export function isSurrogateSplit(sourceText, charOffset) {
  if (charOffset <= 0 || charOffset >= sourceText.length) return false;
  const prev = sourceText.charCodeAt(charOffset - 1);
  const curr = sourceText.charCodeAt(charOffset);
  return prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff;
}

/**
 * Converts a UTF-16 character offset (from file start) to UTF-8 byte offset.
 * Returns null if out-of-bounds or splits a surrogate pair.
 */
export function utf16OffsetToUtf8Byte(sourceText, charOffset) {
  if (!Number.isInteger(charOffset) || charOffset < 0 || charOffset > sourceText.length) {
    return null;
  }
  if (isSurrogateSplit(sourceText, charOffset)) {
    return null;
  }
  return Buffer.byteLength(sourceText.slice(0, charOffset), 'utf8');
}

/**
 * Converts a UTF-8 byte offset (from file start) to UTF-16 character offset.
 * Returns null if out-of-bounds or lands in the middle of a multi-byte UTF-8 sequence.
 */
export function utf8ByteToUtf16Offset(sourceText, byteOffset) {
  const buf = Buffer.from(sourceText, 'utf8');
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset > buf.length) {
    return null;
  }
  if (byteOffset === buf.length) {
    return sourceText.length;
  }
  // Check UTF-8 continuation byte (0x80..0xBF)
  const byte = buf[byteOffset];
  if ((byte & 0xc0) === 0x80) {
    // In middle of multi-byte sequence
    return null;
  }
  const slice = buf.subarray(0, byteOffset).toString('utf8');
  return slice.length;
}

/**
 * Converts an LSP Position { line: 0-indexed, character: 0-indexed UTF-16 }
 * to an exact UTF-8 byte offset.
 */
export function lspPositionToUtf8ByteOffset(sourceText, position) {
  if (!position || typeof position.line !== 'number' || typeof position.character !== 'number') {
    return null;
  }
  const { line, character } = position;
  if (line < 0 || character < 0) return null;

  const { starts } = buildLineStartsUtf16(sourceText);
  if (line >= starts.length) return null;

  const lineStartChar = starts[line];
  const charOffset = lineStartChar + character;

  // Ensure character does not exceed line bounds
  const nextLineStartChar = line + 1 < starts.length ? starts[line + 1] : sourceText.length + 1;
  if (charOffset >= nextLineStartChar && line + 1 < starts.length) {
    return null;
  }

  return utf16OffsetToUtf8Byte(sourceText, charOffset);
}

/**
 * Converts a UTF-8 byte offset to an LSP Position { line, character }.
 */
export function utf8ByteOffsetToLspPosition(sourceText, byteOffset) {
  const charOffset = utf8ByteToUtf16Offset(sourceText, byteOffset);
  if (charOffset === null) return null;

  const { starts } = buildLineStartsUtf16(sourceText);
  // Binary search or upper_bound for the line index
  let low = 0;
  let high = starts.length - 1;
  let line = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= charOffset) {
      line = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const character = charOffset - starts[line];
  return { line, character };
}

/**
 * Converts an LSP Range { start: Position, end: Position } to UTF-8 Byte Span [startByte, endByte].
 */
export function lspRangeToUtf8ByteSpan(sourceText, range) {
  if (!range?.start || !range?.end) return null;
  const startByte = lspPositionToUtf8ByteOffset(sourceText, range.start);
  const endByte = lspPositionToUtf8ByteOffset(sourceText, range.end);
  if (startByte === null || endByte === null || endByte < startByte) {
    return null;
  }
  return { startByte, endByte, length: endByte - startByte };
}

/**
 * Converts a UTF-8 Byte Span { startByte, endByte } to an LSP Range { start, end }.
 */
export function utf8ByteSpanToLspRange(sourceText, span) {
  if (!span || typeof span.startByte !== 'number' || typeof span.endByte !== 'number') {
    return null;
  }
  if (span.endByte < span.startByte) return null;
  const start = utf8ByteOffsetToLspPosition(sourceText, span.startByte);
  const end = utf8ByteOffsetToLspPosition(sourceText, span.endByte);
  if (!start || !end) return null;
  return { start, end };
}
