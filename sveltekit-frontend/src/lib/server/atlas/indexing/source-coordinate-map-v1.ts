import { z } from 'zod';
import { fingerprintStructuralSource } from './structural-observation-v1.js';

/**
 * SourceCoordinateMapV1 — per-sourceRevision UTF-8 byte <-> UTF-16 code-unit reconciliation.
 *
 * UTF-8 byte offsets are the authority (matches ast-grep's JSON output, Tree-sitter's raw byte
 * offsets, and structural-observation-v1.ts's own StructuralObservationV1 spans). UTF-16
 * code-unit positions (what LSP commonly uses, subject to per-session position-encoding
 * negotiation) are a derived projection computed once here and reused, never re-derived per
 * caller.
 *
 * Builds on fingerprintStructuralSource() for the whole-file sha256/utf8ByteLength/
 * utf16CodeUnitLength fields rather than recomputing them (see design.md's Reuse audit).
 */
export const SourceCoordinateSpanInputSchema = z
  .object({
    utf8StartByte: z.number().int().nonnegative(),
    utf8EndByte: z.number().int().nonnegative(),
  })
  .strict()
  .refine((s) => s.utf8EndByte >= s.utf8StartByte, { message: 'utf8EndByte must be >= utf8StartByte' });
export type SourceCoordinateSpanInput = z.infer<typeof SourceCoordinateSpanInputSchema>;

export const SourceCoordinateSpanV1Schema = z
  .object({
    utf8StartByte: z.number().int().nonnegative(),
    utf8EndByte: z.number().int().nonnegative(),
    utf16StartCodeUnit: z.number().int().nonnegative(),
    utf16EndCodeUnit: z.number().int().nonnegative(),
    line: z.number().int().nonnegative(),
    utf8ColumnByte: z.number().int().nonnegative(),
    utf16ColumnCodeUnit: z.number().int().nonnegative(),
  })
  .strict();
export type SourceCoordinateSpanV1 = z.infer<typeof SourceCoordinateSpanV1Schema>;

export const SourceCoordinateMapV1Schema = z
  .object({
    schema: z.literal('atlas.source-coordinate-map.v1'),
    sourceRevision: z.string().min(1),
    sourceByteLength: z.number().int().nonnegative(),
    utf8Checksum: z.string().min(1),
    lineStartByteOffsets: z.array(z.number().int().nonnegative()),
    spans: z.array(SourceCoordinateSpanV1Schema),
  })
  .strict();
export type SourceCoordinateMapV1 = z.infer<typeof SourceCoordinateMapV1Schema>;

interface Boundary {
  utf16Offset: number;
  line: number;
  byteColumn: number;
  utf16Column: number;
}

/**
 * Single forward pass over `source` (iterated by codepoint, so surrogate pairs are handled
 * correctly), recording a byte-offset -> {utf16Offset, line, column} boundary at every codepoint
 * boundary. Span lookups below require utf8StartByte/utf8EndByte to land exactly on a codepoint
 * boundary (true for any real tree-sitter/ast-grep byte offset) -- an offset that doesn't is a
 * caller bug, not something to silently coerce.
 */
function buildBoundaryIndex(source: string): {
  lineStartByteOffsets: number[];
  boundaryByByteOffset: Map<number, Boundary>;
} {
  const boundaryByByteOffset = new Map<number, Boundary>();
  const lineStartByteOffsets: number[] = [0];
  boundaryByByteOffset.set(0, { utf16Offset: 0, line: 0, byteColumn: 0, utf16Column: 0 });

  let byteOffset = 0;
  let utf16Offset = 0;
  let line = 0;
  let byteColumn = 0;
  let utf16Column = 0;

  for (const ch of source) {
    const byteLen = Buffer.byteLength(ch, 'utf8');
    const utf16Len = ch.length;
    byteOffset += byteLen;
    utf16Offset += utf16Len;
    if (ch === '\n') {
      line += 1;
      byteColumn = 0;
      utf16Column = 0;
      lineStartByteOffsets.push(byteOffset);
    } else {
      byteColumn += byteLen;
      utf16Column += utf16Len;
    }
    boundaryByByteOffset.set(byteOffset, { utf16Offset, line, byteColumn, utf16Column });
  }

  return { lineStartByteOffsets, boundaryByByteOffset };
}

export function buildSourceCoordinateMap(input: {
  sourceRevision: string;
  source: string;
  spans: readonly SourceCoordinateSpanInput[];
}): SourceCoordinateMapV1 {
  const fingerprint = fingerprintStructuralSource(input.source);
  const { lineStartByteOffsets, boundaryByByteOffset } = buildBoundaryIndex(input.source);

  const spans = input.spans.map((span) => {
    const parsed = SourceCoordinateSpanInputSchema.parse(span);
    const start = boundaryByByteOffset.get(parsed.utf8StartByte);
    const end = boundaryByByteOffset.get(parsed.utf8EndByte);
    if (!start || !end) {
      throw new Error(
        `SourceCoordinateMapV1: span [${parsed.utf8StartByte}, ${parsed.utf8EndByte}) does not align to a UTF-8 codepoint boundary for sourceRevision ${input.sourceRevision}`,
      );
    }
    return SourceCoordinateSpanV1Schema.parse({
      utf8StartByte: parsed.utf8StartByte,
      utf8EndByte: parsed.utf8EndByte,
      utf16StartCodeUnit: start.utf16Offset,
      utf16EndCodeUnit: end.utf16Offset,
      line: start.line,
      utf8ColumnByte: start.byteColumn,
      utf16ColumnCodeUnit: start.utf16Column,
    });
  });

  return SourceCoordinateMapV1Schema.parse({
    schema: 'atlas.source-coordinate-map.v1',
    sourceRevision: input.sourceRevision,
    sourceByteLength: fingerprint.utf8ByteLength,
    utf8Checksum: fingerprint.sha256,
    lineStartByteOffsets,
    spans,
  });
}

// ── Per-sourceRevision memoization (task 3.2) ──────────────────────────────
// Plain in-memory Map, not Redis: the map is a pure, deterministic function of
// (sourceRevision, source, spans) with no cross-process sharing requirement in this contract's
// scope (per design.md's proof-gate-only, no-production-wiring non-goal) -- matches this repo's
// existing pattern of small process-local Map caches (e.g. cache/tensor-similarity-cache.ts's
// key builders) rather than introducing a new Redis-backed layer for a cheap-to-recompute value.
const MAX_CACHED_REVISIONS = 200;
const sourceCoordinateMapCache = new Map<string, SourceCoordinateMapV1>();

export function getOrBuildSourceCoordinateMap(input: {
  sourceRevision: string;
  source: string;
  spans: readonly SourceCoordinateSpanInput[];
}): SourceCoordinateMapV1 {
  const cached = sourceCoordinateMapCache.get(input.sourceRevision);
  if (cached) return cached;

  const built = buildSourceCoordinateMap(input);
  if (sourceCoordinateMapCache.size >= MAX_CACHED_REVISIONS) {
    const oldestKey = sourceCoordinateMapCache.keys().next().value;
    if (oldestKey !== undefined) sourceCoordinateMapCache.delete(oldestKey);
  }
  sourceCoordinateMapCache.set(input.sourceRevision, built);
  return built;
}

export function clearSourceCoordinateMapCache(): void {
  sourceCoordinateMapCache.clear();
}
