export function attachUniqueSourceSpanV1(sourceText, chunk) {
  if (typeof sourceText !== 'string' || typeof chunk?.text !== 'string' || !chunk.text.length) {
    return { ...chunk, start: undefined, end: undefined, sourceByteStart: undefined, sourceByteEnd: undefined };
  }

  const start = sourceText.indexOf(chunk.text);
  if (start < 0 || sourceText.indexOf(chunk.text, start + 1) >= 0) {
    return { ...chunk, start: undefined, end: undefined, sourceByteStart: undefined, sourceByteEnd: undefined };
  }

  const end = start + chunk.text.length;
  return {
    ...chunk,
    start,
    end,
    sourceByteStart: Buffer.byteLength(sourceText.slice(0, start), 'utf8'),
    sourceByteEnd: Buffer.byteLength(sourceText.slice(0, end), 'utf8'),
  };
}

export function chunkTextAtUtf8BoundariesV1(sourceText, size, overlap) {
  if (typeof sourceText !== 'string'
    || !Number.isSafeInteger(size) || size < 1
    || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= size
    || Buffer.from(sourceText, 'utf8').toString('utf8') !== sourceText) {
    throw new TypeError('SOURCE_OR_WINDOW_CONFIGURATION_INVALID');
  }

  const chunks = [];
  let start = 0;
  while (start < sourceText.length) {
    let end = utf8Boundary(sourceText, Math.min(start + size, sourceText.length), 'before');
    if (end <= start) end = utf8Boundary(sourceText, Math.min(start + size, sourceText.length), 'after');
    if (end <= start) throw new RangeError('WINDOW_CANNOT_ADVANCE_AT_UTF8_BOUNDARY');
    chunks.push({
      text: sourceText.slice(start, end),
      start,
      end,
      sourceByteStart: Buffer.byteLength(sourceText.slice(0, start), 'utf8'),
      sourceByteEnd: Buffer.byteLength(sourceText.slice(0, end), 'utf8'),
    });
    if (end === sourceText.length) break;
    start = utf8Boundary(sourceText, Math.max(start + 1, end - overlap), 'after');
    if (start >= end) start = end;
  }
  return chunks;
}

export function chunkLargeTextAtSourceV1(sourceText, { size, overlap, maxChunks }) {
  if (typeof sourceText !== 'string'
    || Buffer.from(sourceText, 'utf8').toString('utf8') !== sourceText
    || !Number.isSafeInteger(size) || size < 1
    || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= size
    || !Number.isSafeInteger(maxChunks) || maxChunks < 1) {
    throw new TypeError('CHUNK_SOURCE_OR_CONFIGURATION_INVALID');
  }

  const paragraphs = sourceText.split(/\n{2,}/);
  if (paragraphs.length >= 4) {
    const chunks = [];
    let buffer = '';
    const flush = () => {
      const trimmed = buffer.trim();
      if (trimmed.length > 40) {
        chunks.push(attachUniqueSourceSpanV1(sourceText, { text: trimmed, chunk_kind: 'large-text' }));
      }
      buffer = '';
    };

    for (const paragraph of paragraphs) {
      if (chunks.length >= maxChunks) break;
      if (paragraph.length > size) {
        flush();
        for (const window of chunkTextAtUtf8BoundariesV1(paragraph, size, overlap)) {
          if (chunks.length >= maxChunks) break;
          if (window.text.trim().length > 40) {
            chunks.push(attachUniqueSourceSpanV1(sourceText, {
              text: window.text,
              chunk_kind: 'large-text',
            }));
          }
        }
        continue;
      }
      if (buffer.length + paragraph.length + 2 > size) {
        flush();
        buffer = paragraph;
      } else {
        buffer += (buffer ? '\n\n' : '') + paragraph;
      }
    }
    if (chunks.length < maxChunks) flush();
    if (chunks.length >= 4) return chunks;
  }

  return chunkTextAtUtf8BoundariesV1(sourceText, size, overlap)
    .slice(0, maxChunks)
    .map((chunk) => ({ ...chunk, chunk_kind: 'large-text' }));
}

function utf8Boundary(text, offset, direction) {
  if (offset <= 0 || offset >= text.length) return offset;
  const previous = text.charCodeAt(offset - 1);
  const current = text.charCodeAt(offset);
  if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) {
    return direction === 'before' ? offset - 1 : offset + 1;
  }
  return offset;
}
