import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { StructuralReferenceFactV1 } from './structural-symbol.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const position = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }).strict();
const range = z.object({ start: position, end: position }).strict();
export type LspPositionV1 = z.infer<typeof position>;
export type LspRangeV1 = z.infer<typeof range>;

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
