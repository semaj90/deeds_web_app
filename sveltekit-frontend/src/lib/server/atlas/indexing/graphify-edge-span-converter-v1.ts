/**
 * Line/column -> byte/row conversion for treesitter-chunker (`:8095`) edge spans (GSP-5 step 2 / (c)).
 *
 * Conventions were measured against the live chunker, not assumed (2026-10-04):
 *   - lines are 1-based; columns are 0-based;
 *   - columns count Unicode CODE POINTS (not UTF-16 units, not UTF-8 bytes): on a line that opens with a block
 *     comment holding one emoji, the following `export` keyword is reported at column 8 (UTF-16 would give 9,
 *     UTF-8 bytes 11);
 *   - the edge span is the CONTAINING DECLARATION node, not the reference site (e.g. 14:0-20:2 covers a whole type).
 *     Evidence built from it must be labelled as a containing-node span, never as a call-site span.
 * Output rows are 0-based (tree-sitter point convention, matching `graphifyEdgeEvidenceSpanV1Schema`'s rows) and bytes
 * are offsets into the UTF-8 encoding of the exact source text. Pure: reads nothing, writes nothing, owns no identity.
 * Lines split on `\n` only (a `\r` stays part of its line), as tree-sitter does.
 */
export type ChunkerLineColumnSpanV1 = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type ByteRowSpanV1 = { startByte: number; endByte: number; startRow: number; endRow: number };

export type SpanConversionFailureV1 =
  | 'INVALID_SPAN_NUMBERS'
  | 'LINE_OUT_OF_RANGE'
  | 'COLUMN_OUT_OF_RANGE'
  | 'END_BEFORE_START';

export type SpanConversionResultV1 =
  | { ok: true; span: ByteRowSpanV1 }
  | { ok: false; reason: SpanConversionFailureV1 };

export type SourceLineIndexV1 = {
  lines: readonly string[];
  /** Byte offset of the first byte of each line (same length as `lines`). */
  lineStartBytes: readonly number[];
  totalBytes: number;
};

const utf8Length = (codePoint: number): number =>
  codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;

function lineBytes(line: string): number {
  let n = 0;
  for (const ch of line) n += utf8Length(ch.codePointAt(0)!);
  return n;
}

/** Build once per source text; reuse for every span in that file. */
export function buildSourceLineIndexV1(source: string): SourceLineIndexV1 {
  const lines = source.split('\n');
  const lineStartBytes: number[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStartBytes.push(offset);
    offset += lineBytes(lines[i]) + (i < lines.length - 1 ? 1 : 0);
  }
  return { lines, lineStartBytes, totalBytes: offset };
}

/** Byte offset of (1-based line, 0-based code-point column), or a named failure. */
function positionToByte(index: SourceLineIndexV1, line: number, column: number): number | 'LINE_OUT_OF_RANGE' | 'COLUMN_OUT_OF_RANGE' {
  if (line < 1 || line > index.lines.length) return 'LINE_OUT_OF_RANGE';
  const text = index.lines[line - 1];
  let bytes = 0;
  let col = 0;
  for (const ch of text) {
    if (col === column) return index.lineStartBytes[line - 1] + bytes;
    bytes += utf8Length(ch.codePointAt(0)!);
    col += 1;
  }
  if (col === column) return index.lineStartBytes[line - 1] + bytes; // column at end of line is valid
  return 'COLUMN_OUT_OF_RANGE';
}

export function convertChunkerSpanToByteRowV1(index: SourceLineIndexV1, span: ChunkerLineColumnSpanV1): SpanConversionResultV1 {
  const nums = [span.startLine, span.startColumn, span.endLine, span.endColumn];
  if (!nums.every((n) => Number.isInteger(n) && n >= 0)) return { ok: false, reason: 'INVALID_SPAN_NUMBERS' };
  const start = positionToByte(index, span.startLine, span.startColumn);
  if (typeof start === 'string') return { ok: false, reason: start };
  const end = positionToByte(index, span.endLine, span.endColumn);
  if (typeof end === 'string') return { ok: false, reason: end };
  if (end < start) return { ok: false, reason: 'END_BEFORE_START' };
  return { ok: true, span: { startByte: start, endByte: end, startRow: span.startLine - 1, endRow: span.endLine - 1 } };
}
