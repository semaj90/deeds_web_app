import { z } from 'zod';
import { fingerprintStructuralSource } from './structural-observation-v1.js';

/**
 * SourceCoordinateMapV1 — per-sourceRevision UTF-8 byte <-> UTF-16 code-unit reconciliation.
 *
 * UTF-8 byte offsets are the authority (matches ast-grep's `--json` `range.byteOffset` output,
 * the CLI/native Tree-sitter grammar's raw byte offsets, and structural-observation-v1.ts's own
 * StructuralObservationV1 spans). UTF-16 code-unit positions (what LSP commonly uses, subject to
 * per-session position-encoding negotiation) are a derived projection computed once here and
 * reused, never re-derived per caller.
 *
 * RUNTIME CAVEAT (found 2026-09-22, wiring symbol-kind-smoke-fanout-v1.mjs to this module; wording
 * corrected 2026-09-22 after review -- do not overclaim a universal package API contract). Upstream
 * `@types/tree-sitter` still documents `SyntaxNode.startIndex`/`endIndex` as byte offsets. The
 * installed Node tree-sitter runtime used by this repo's TS/JS symbol-kind producer (`tree-sitter`
 * 0.25.1 + `tree-sitter-typescript` 0.23.2, JS-string input mode) has been empirically proven to
 * expose JS-string/UTF-16-code-unit indexing for that path instead (a 3-byte-UTF-8 CJK character
 * before a `function` declaration produced `startIndex=17`, matching the UTF-16 code-unit index,
 * not the expected UTF-8 byte index of 23 -- proof fixture + versions recorded in the smoke-fanout
 * receipt, not just asserted here). Do NOT assume this is true of every Tree-sitter/ast-grep
 * producer or of a future package upgrade -- other producers (ast-grep's CLI `--json` output,
 * native/Rust grammars) retain their own proven, separately-verified coordinate basis. Any adapter
 * whose coordinate basis is not already known to be UTF-8 bytes MUST use `createSourceOffsetConverter()`
 * below rather than assume a conversion recipe inline -- see `SourceOffsetBasisV1` for the producer
 * vocabulary this module expects callers to be explicit about.
 *
 * Builds on fingerprintStructuralSource() for the whole-file sha256/utf8ByteLength/
 * utf16CodeUnitLength fields rather than recomputing them (see design.md's Reuse audit).
 */

/**
 * Explicit producer/coordinate-basis vocabulary. A caller must know and declare which basis its
 * raw offsets are in before this module will convert them -- ambiguous "index: 123" values are
 * exactly what caused the runtime caveat above. Every producer basis normalizes, after conversion,
 * to UTF-8 bytes (this module's own authority) -- 'UTF8_PARSER_BUFFER_V1' names that normalized
 * target state for receipts/logging, it is not itself a distinct input basis.
 */
export const SourceOffsetBasisV1Schema = z.enum([
  'AST_GREP_JSON',        // ast-grep --json range.byteOffset -- already UTF-8 bytes
  'NATIVE_TREE_SITTER',   // native/Rust Tree-sitter grammar -- already UTF-8 bytes
  'NODE_TREE_SITTER_JS',  // tree-sitter npm package JS Node.startIndex/endIndex -- UTF-16 code units (this runtime, proven above)
  'LSP_UTF16',            // LSP position with negotiated 'utf-16' encoding -- UTF-16 code units
  'LSP_UTF8',             // LSP position with negotiated 'utf-8' encoding -- already UTF-8 bytes
  'UTF8_PARSER_BUFFER_V1', // normalized target state -- not a producer, used for receipt labeling only
]);
export type SourceOffsetBasisV1 = z.infer<typeof SourceOffsetBasisV1Schema>;
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
  byteOffset: number;
  utf16Offset: number;
  line: number;
  byteColumn: number;
  utf16Column: number;
}

/**
 * Single forward pass over `source` (iterated by codepoint, so surrogate pairs are handled
 * correctly as one unit, never split), recording a boundary at every codepoint boundary, keyed
 * BOTH by byte offset and by UTF-16 code-unit offset from the same pass -- one shared source of
 * truth for both lookup directions, never two independently-computed indices that could drift.
 * A byte or UTF-16 offset that does not land exactly on a codepoint boundary (e.g. a caller
 * mid-surrogate offset) has no entry in either map -- lookups below fail closed on that, they do
 * not silently coerce to a nearby boundary.
 */
function buildBoundaryIndex(source: string): {
  lineStartByteOffsets: number[];
  boundaryByByteOffset: Map<number, Boundary>;
  boundaryByUtf16Offset: Map<number, Boundary>;
} {
  const boundaryByByteOffset = new Map<number, Boundary>();
  const boundaryByUtf16Offset = new Map<number, Boundary>();
  const lineStartByteOffsets: number[] = [0];
  const zero: Boundary = { byteOffset: 0, utf16Offset: 0, line: 0, byteColumn: 0, utf16Column: 0 };
  boundaryByByteOffset.set(0, zero);
  boundaryByUtf16Offset.set(0, zero);

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
    const boundary: Boundary = { byteOffset, utf16Offset, line, byteColumn, utf16Column };
    boundaryByByteOffset.set(byteOffset, boundary);
    boundaryByUtf16Offset.set(utf16Offset, boundary);
  }

  return { lineStartByteOffsets, boundaryByByteOffset, boundaryByUtf16Offset };
}

/**
 * Reusable per-source UTF-16-code-unit <-> UTF-8-byte converter. Build ONCE per file/source and
 * reuse across every observation in that file -- NOT `Buffer.byteLength(source.slice(0, idx))`
 * repeated per symbol, which is correct but re-walks the string prefix on every call. Fails
 * closed (throws) rather than silently coercing when an offset does not land on a real codepoint
 * boundary (out of range, or a mid-surrogate-pair offset) -- this is the mechanism the
 * "invalid mid-surrogate: fail closed" regression proves.
 */
export function createSourceOffsetConverter(source: string): {
  utf16CodeUnitToUtf8Byte(codeUnitOffset: number): number;
  utf8ByteToUtf16CodeUnit(byteOffset: number): number;
} {
  const { boundaryByByteOffset, boundaryByUtf16Offset } = buildBoundaryIndex(source);
  return {
    utf16CodeUnitToUtf8Byte(codeUnitOffset: number): number {
      const boundary = boundaryByUtf16Offset.get(codeUnitOffset);
      if (!boundary) {
        throw new Error(
          `createSourceOffsetConverter: UTF-16 code-unit offset ${codeUnitOffset} does not land on a codepoint boundary (out of range or mid-surrogate-pair)`,
        );
      }
      return boundary.byteOffset;
    },
    utf8ByteToUtf16CodeUnit(byteOffset: number): number {
      const boundary = boundaryByByteOffset.get(byteOffset);
      if (!boundary) {
        throw new Error(
          `createSourceOffsetConverter: UTF-8 byte offset ${byteOffset} does not land on a codepoint boundary (out of range or mid-multibyte-sequence)`,
        );
      }
      return boundary.utf16Offset;
    },
  };
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
