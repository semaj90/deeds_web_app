import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { StructuralReferenceFactV1 } from './structural-symbol.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const position = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }).strict();
const range = z.object({ start: position, end: position }).strict();
export type LspPositionV1 = z.infer<typeof position>;
export type LspRangeV1 = z.infer<typeof range>;

// `fatal: true` makes decode throw on invalid UTF-8 rather than Node's Buffer.toString('utf8')
// default of silently substituting U+FFFD (Node's own docs document that substitution behavior).
// A byte offset that lands inside a multibyte UTF-8 code point must fail closed here, not
// silently produce a plausible-looking but wrong decoded string.
const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });

/** Strict UTF-8 decode — throws SOURCE_BYTES_INVALID_UTF8 instead of masking corruption/an
 * off-boundary offset with a replacement character. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return utf8FatalDecoder.decode(bytes);
  } catch {
    throw new Error('SOURCE_BYTES_INVALID_UTF8');
  }
}

export const lspUtf8ByteSpanSchema = z.object({
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  expected_text: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.byte_end <= value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must exceed byte_start' });
  }
});
export type LspUtf8ByteSpanV1 = z.infer<typeof lspUtf8ByteSpanSchema>;

export const lspTargetByteAlignmentSchema = z.object({
  target_source_ref: z.string().min(1),
  target_source_revision: revision,
  position_encoding: z.enum(['utf-8', 'utf-16', 'utf-32']),
  target_range: range,
  target_byte_range: z.object({ byte_start: z.number().int().nonnegative(), byte_end: z.number().int().nonnegative() }).strict(),
  target_selection_range: range.nullable(),
  target_selection_byte_range: z.object({ byte_start: z.number().int().nonnegative(), byte_end: z.number().int().nonnegative() }).strict().nullable(),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.target_byte_range.byte_end <= value.target_byte_range.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_byte_range'], message: 'target byte range must be non-empty' });
  }
  if (value.target_selection_byte_range && value.target_selection_byte_range.byte_end < value.target_selection_byte_range.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_selection_byte_range'], message: 'selection byte range must not be reversed' });
  }
});
export type LspTargetByteAlignmentV1 = z.infer<typeof lspTargetByteAlignmentSchema>;

export const lspSemanticObservationSchema = z.object({
  schema: z.literal('atlas.lsp-semantic-observation.v1').default('atlas.lsp-semantic-observation.v1'),
  observation_id: id,
  reference_id: id,
  source_ref: z.string().min(1),
  source_tree_node_id: id.nullable().default(null),
  source_revision: revision,
  workspace_revision: revision,
  server_id: id,
  server_revision: revision,
  project_revision: revision,
  project_config_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  capability_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  position_encoding: z.enum(['utf-8', 'utf-16', 'utf-32']),
  operation: z.enum([
    'DEFINITION', 'REFERENCES', 'IMPLEMENTATION', 'TYPE_DEFINITION',
    'CALL_HIERARCHY_IN', 'CALL_HIERARCHY_OUT', 'TYPE_HIERARCHY',
    'DOCUMENT_SYMBOL', 'SEMANTIC_TOKEN', 'DIAGNOSTIC',
  ]),
  source_range: range,
  target_uri: z.string().min(1).nullable().default(null),
  target_source_ref: z.string().min(1).nullable().default(null),
  target_range: range.nullable().default(null),
  target_text: z.string().min(1).nullable().default(null),
  target_upstream_node_id: id.nullable().default(null),
  result_status: z.enum(['resolved', 'ambiguous', 'unresolved', 'not_supported']),
  evidence_refs: z.array(id).default([]),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  canonical_authority: z.literal(false).default(false),
}).strict();

export const lspResolvedStructuralReferenceSchema = z.object({
  schema: z.literal('atlas.lsp-resolved-structural-reference.v1').default('atlas.lsp-resolved-structural-reference.v1'),
  resolution_id: id,
  reference_id: id,
  reference_kind: id,
  source_ref: z.string().min(1),
  source_tree_node_id: id.nullable(),
  source_revision: revision,
  workspace_revision: revision,
  target_text: z.string().min(1),
  target_uri: z.string().min(1).nullable(),
  target_source_ref: z.string().min(1).nullable(),
  target_range: range.nullable(),
  target_upstream_node_id: id.nullable(),
  position_encoding: z.enum(['utf-8', 'utf-16', 'utf-32']),
  server_id: id,
  server_revision: revision,
  project_revision: revision,
  project_config_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  capability_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  resolution_status: z.enum(['resolved', 'ambiguous', 'unresolved', 'not_supported']),
  resolution_basis: z.enum(['lsp_definition', 'lsp_reference', 'lsp_implementation', 'lsp_type_definition', 'lsp_call_hierarchy', 'lsp_type_hierarchy', 'lsp_observation']),
  observation_id: id,
  evidence_refs: z.array(id),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export type LspSemanticObservationV1 = z.infer<typeof lspSemanticObservationSchema>;
export type LspResolvedStructuralReferenceV1 = z.infer<typeof lspResolvedStructuralReferenceSchema>;

/** Verify a converted span against the exact UTF-8 source bytes supplied by the caller. */
export function verifyLspUtf8ByteSpan(sourceBuffer: Buffer, input: LspUtf8ByteSpanV1): { byte_start: number; byte_end: number; text: string } {
  const span = lspUtf8ByteSpanSchema.parse(input);
  if (span.byte_end > sourceBuffer.length) throw new Error('LSP_BYTE_SPAN_OUT_OF_RANGE');
  let actual: string;
  try {
    actual = decodeUtf8Strict(sourceBuffer.subarray(span.byte_start, span.byte_end));
  } catch {
    throw new Error('LSP_BYTE_SPAN_SPLITS_UTF8_SEQUENCE');
  }
  if (actual !== span.expected_text) throw new Error('LSP_BYTE_SPAN_TEXT_MISMATCH');
  return { byte_start: span.byte_start, byte_end: span.byte_end, text: actual };
}

// jsonRpcContentEncoding: LSP JSON-RPC message CONTENT is always UTF-8 on the wire (this is not
// negotiable, unlike position units). lspPositionEncoding: the *meaning of Position.character*,
// negotiated per LSP 3.17's positionEncoding capability (utf-8/utf-16/utf-32; utf-16 is the
// mandatory-support/default-compatibility encoding). atlasCoordinateSpace: what this repo's own
// identity/graph layer stores coordinates as — always UTF8_BYTES. These are three DISTINCT axes;
// do not collapse them into a single "wireProtocol" field, and do not conflate "the wire is UTF-8"
// with "positions are UTF-8" (they're independent — the wire content encoding never changes even
// when the negotiated position unit is utf-16 or utf-32).
export const verifiedSourceByteSpanSchema = z.object({
  schema: z.literal('atlas.verified-source-byte-span.v1').default('atlas.verified-source-byte-span.v1'),
  source_ref: z.string().min(1),
  // Path/identity-scoped source revision (e.g. a future `gitsrc:v1:<hash(repoId, sourceRef,
  // mode, blobOid)>`) — distinct from the raw content checksum below. They may coincide (as they
  // currently do, since this repo's live sourceRevision IS a content sha256 today) but must never
  // be assumed interchangeable once a path-scoped revision scheme lands.
  source_revision: revision,
  // sha256 of the EXACT bytes this span was verified against — always a content hash, always
  // independently recomputable from sourceBytes, never substituted with source_revision.
  source_content_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  json_rpc_content_encoding: z.literal('utf-8').default('utf-8'),
  lsp_position_encoding: z.enum(['utf-8', 'utf-16', 'utf-32']),
  atlas_coordinate_space: z.literal('UTF8_BYTES').default('UTF8_BYTES'),
  lsp_range: range,
  byte_range: z.object({
    byte_start: z.number().int().nonnegative(),
    byte_end: z.number().int().nonnegative(),
  }).strict(),
  expected_text: z.string().nullable(),
  canonical_authority: z.literal(false).default(false),
  writes_performed: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  // LSP ranges may legitimately be empty (a zero-width cursor position) — only reject a
  // genuinely reversed range, not a non-positive-length one.
  if (value.byte_range.byte_end < value.byte_range.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_range'], message: 'BYTE_RANGE_REVERSED' });
  }
});
export type VerifiedSourceByteSpanV1 = z.infer<typeof verifiedSourceByteSpanSchema>;

/**
 * LSP-SOURCE-BYTE-SPAN-VERIFY-01: verifies a negotiated LSP range against the EXACT source bytes
 * it claims to describe, independent of any target-side resolution. Operates on
 * `Uint8Array.subarray()` byte positions, never on `string.slice()` — a JS string index is a
 * UTF-16 code-unit offset, not a UTF-8 byte offset, and using one where the other is required is
 * exactly the class of bug this gate exists to catch.
 */
export function verifyLspSourceByteSpan(input: {
  sourceBytes: Uint8Array;
  sourceRef: string;
  sourceRevision: string;
  sourceContentChecksum: string;
  lspRange: LspRangeV1;
  positionEncoding: 'utf-8' | 'utf-16' | 'utf-32';
  expectedText?: string | null;
}): VerifiedSourceByteSpanV1 {
  // 1. Validate the entire source as UTF-8 up front — fail closed before any coordinate math.
  const sourceText = decodeUtf8Strict(input.sourceBytes);

  // 2. Verify the actual bytes against the independently recorded content checksum.
  const actualChecksum = `sha256:${createHash('sha256').update(input.sourceBytes).digest('hex')}`;
  if (actualChecksum !== input.sourceContentChecksum) {
    throw new Error('SOURCE_CONTENT_CHECKSUM_MISMATCH');
  }

  // 3. Convert negotiated LSP coordinates → canonical UTF-8 byte range.
  const byteRange = lspRangeToUtf8ByteRange(sourceText, input.lspRange, input.positionEncoding);

  // 4. Bounds (lspRangeToUtf8ByteRange already rejects a reversed range; this also catches an
  // end past the actual byte length, which a string-length-derived offset cannot detect on its
  // own if the string was already corrupted — belt-and-suspenders given step 1 already ran).
  if (byteRange.byte_start < 0 || byteRange.byte_end > input.sourceBytes.length) {
    throw new Error('SOURCE_BYTE_RANGE_INVALID');
  }

  // 5. Decode the EXACT byte slice strictly — never `sourceText.slice(...)`, which would be
  // UTF-16-code-unit-indexed and silently wrong here.
  const spanBytes = input.sourceBytes.subarray(byteRange.byte_start, byteRange.byte_end);
  const spanText = decodeUtf8Strict(spanBytes);

  // 6. Optional semantic/text evidence.
  if (input.expectedText != null && spanText !== input.expectedText) {
    throw new Error('SOURCE_SPAN_TEXT_MISMATCH');
  }

  return verifiedSourceByteSpanSchema.parse({
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    source_content_checksum: actualChecksum,
    json_rpc_content_encoding: 'utf-8',
    lsp_position_encoding: input.positionEncoding,
    atlas_coordinate_space: 'UTF8_BYTES',
    lsp_range: input.lspRange,
    byte_range: byteRange,
    expected_text: input.expectedText ?? spanText,
    canonical_authority: false,
    writes_performed: false,
  });
}

/** Convert a resolved target range only against the exact revision-bound target source. */
export function alignLspTargetByteRanges(input: {
  target_source_ref: string;
  target_source_revision: string;
  source_text: string;
  position_encoding: 'utf-8' | 'utf-16' | 'utf-32';
  target_range: LspRangeV1;
  target_selection_range?: LspRangeV1 | null;
}): LspTargetByteAlignmentV1 {
  const targetByteRange = lspRangeToUtf8ByteRange(input.source_text, input.target_range, input.position_encoding);
  const selectionByteRange = input.target_selection_range
    ? lspRangeToUtf8ByteRange(input.source_text, input.target_selection_range, input.position_encoding)
    : null;
  return lspTargetByteAlignmentSchema.parse({
    target_source_ref: input.target_source_ref,
    target_source_revision: input.target_source_revision,
    position_encoding: input.position_encoding,
    target_range: input.target_range,
    target_byte_range: targetByteRange,
    target_selection_range: input.target_selection_range ?? null,
    target_selection_byte_range: selectionByteRange,
    canonical_authority: false,
  });
}

function lineSlices(source: string): Array<{ text: string; start: number }> {
  const lines: Array<{ text: string; start: number }> = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index === source.length || source[index] === '\n' || source[index] === '\r') {
      lines.push({ text: source.slice(start, index), start });
      if (source[index] === '\r' && source[index + 1] === '\n') index += 1;
      start = index + 1;
    }
  }
  return lines;
}

/** Convert negotiated LSP coordinates into exact UTF-8 source-byte offsets. */
export function lspPositionToUtf8ByteOffset(
  source: string,
  input: LspPositionV1,
  encoding: 'utf-8' | 'utf-16' | 'utf-32',
): number {
  const line = lineSlices(source)[input.line];
  if (!line) throw new Error('LSP_POSITION_LINE_OUT_OF_RANGE');
  let jsOffset = 0;
  if (encoding === 'utf-16') {
    if (input.character > line.text.length) throw new Error('LSP_POSITION_CHARACTER_OUT_OF_RANGE');
    if (
      input.character > 0 &&
      input.character < line.text.length &&
      ((line.text.charCodeAt(input.character - 1) >= 0xd800 && line.text.charCodeAt(input.character - 1) <= 0xdbff &&
        line.text.charCodeAt(input.character) >= 0xdc00 && line.text.charCodeAt(input.character) <= 0xdfff) ||
        (line.text.charCodeAt(input.character - 1) >= 0xdc00 && line.text.charCodeAt(input.character - 1) <= 0xdfff &&
          line.text.charCodeAt(input.character) >= 0xd800 && line.text.charCodeAt(input.character) <= 0xdbff))
    ) {
      throw new Error('LSP_POSITION_SPLITS_CODE_POINT');
    }
    jsOffset = input.character;
  } else {
    let units = 0;
    for (const character of Array.from(line.text)) {
      const width = encoding === 'utf-8' ? Buffer.byteLength(character, 'utf8') : 1;
      if (units + width > input.character) throw new Error('LSP_POSITION_SPLITS_CODE_POINT');
      if (units + width === input.character) {
        jsOffset += character.length;
        units += width;
        break;
      }
      jsOffset += character.length;
      units += width;
    }
    if (units !== input.character) throw new Error('LSP_POSITION_CHARACTER_OUT_OF_RANGE');
  }
  return Buffer.byteLength(source.slice(0, line.start + jsOffset), 'utf8');
}

export function lspRangeToUtf8ByteRange(
  source: string,
  input: LspRangeV1,
  encoding: 'utf-8' | 'utf-16' | 'utf-32',
): { byte_start: number; byte_end: number } {
  const byte_start = lspPositionToUtf8ByteOffset(source, input.start, encoding);
  const byte_end = lspPositionToUtf8ByteOffset(source, input.end, encoding);
  if (byte_end < byte_start) throw new Error('LSP_RANGE_REVERSED');
  return { byte_start, byte_end };
}

function resolutionBasis(operation: LspSemanticObservationV1['operation']): LspResolvedStructuralReferenceV1['resolution_basis'] {
  if (operation === 'DEFINITION') return 'lsp_definition';
  if (operation === 'REFERENCES') return 'lsp_reference';
  if (operation === 'IMPLEMENTATION') return 'lsp_implementation';
  if (operation === 'TYPE_DEFINITION') return 'lsp_type_definition';
  if (operation.startsWith('CALL_HIERARCHY')) return 'lsp_call_hierarchy';
  if (operation.startsWith('TYPE_HIERARCHY')) return 'lsp_type_hierarchy';
  return 'lsp_observation';
}

/** Adds compiler/LSP semantics without minting canonical Atlas identity. */
export function synthesizeLspStructuralReference(
  fact: StructuralReferenceFactV1,
  rawObservation: z.input<typeof lspSemanticObservationSchema>,
  producerRevision: string,
): LspResolvedStructuralReferenceV1 {
  const observation = lspSemanticObservationSchema.parse(rawObservation);
  if (observation.source_ref !== fact.source_ref) throw new Error('LSP_SOURCE_REF_MISMATCH');
  if (observation.source_revision !== fact.source_revision) throw new Error('LSP_SOURCE_REVISION_MISMATCH');
  if (observation.workspace_revision !== fact.workspace_revision) throw new Error('LSP_WORKSPACE_REVISION_MISMATCH');
  return lspResolvedStructuralReferenceSchema.parse({
    resolution_id: `lsp:${fact.reference_id}:${observation.observation_id}`,
    reference_id: fact.reference_id,
    reference_kind: fact.reference_kind,
    source_ref: fact.source_ref,
    source_tree_node_id: observation.source_tree_node_id,
    source_revision: fact.source_revision,
    workspace_revision: fact.workspace_revision,
    target_text: observation.target_text ?? fact.target_text,
    target_uri: observation.target_uri,
    target_source_ref: observation.target_source_ref,
    target_range: observation.target_range,
    target_upstream_node_id: observation.target_upstream_node_id,
    resolution_status: observation.result_status,
    resolution_basis: resolutionBasis(observation.operation),
    position_encoding: observation.position_encoding,
    server_id: observation.server_id,
    server_revision: observation.server_revision,
    project_revision: observation.project_revision,
    project_config_checksum: observation.project_config_checksum,
    capability_checksum: observation.capability_checksum,
    observation_id: observation.observation_id,
    evidence_refs: [...new Set([...fact.evidence_refs, ...observation.evidence_refs])].sort(),
    producer_revision: producerRevision,
    canonical_authority: false,
  });
}

export function deriveCompilerSemanticGraphRevision(input: {
  workspaceRevision: string;
  observations: readonly LspSemanticObservationV1[];
}): string {
  if (!input.workspaceRevision.trim()) throw new Error('LSP_WORKSPACE_REVISION_REQUIRED');
  const rows = input.observations.map((observation) => lspSemanticObservationSchema.parse(observation)).sort((a, b) =>
    a.checksum.localeCompare(b.checksum) || a.observation_id.localeCompare(b.observation_id));
  const payload = {
    workspaceRevision: input.workspaceRevision,
    serverRevisions: [...new Set(rows.map((row) => `${row.server_id}:${row.server_revision}`))].sort(),
    projectRevisions: [...new Set(rows.map((row) => `${row.project_revision}:${row.project_config_checksum}`))].sort(),
    capabilityChecksums: [...new Set(rows.map((row) => row.capability_checksum))].sort(),
    inputSourceRevisionSetChecksum: `sha256:${createHash('sha256').update(JSON.stringify([...new Set(rows.map((row) => `${row.source_ref}:${row.source_revision}`))].sort())).digest('hex')}`,
    observationSetChecksum: `sha256:${createHash('sha256').update(JSON.stringify(rows.map((row) => row.checksum))).digest('hex')}`,
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}
