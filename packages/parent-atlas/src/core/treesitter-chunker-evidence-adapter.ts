import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  structuralExtractionInputSchema,
  type StructuralExtractionInputV1,
} from './structural-extraction-fabric.js';

const id = z.string().min(1);
const revision = z.string().min(1);

const atlasAstEvidenceChunkSchema = z.object({
  upstream_chunk_id: id.optional(),
  upstream_node_id: id.optional(),
  upstream_file_id: id.optional(),
  upstream_symbol_id: id.optional(),
  node_type: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().nullable().optional(),
  parent_route: z.array(z.string()).optional(),
  parent_context: z.string().nullable().optional(),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  start_line: z.number().int().nonnegative(),
  start_column: z.number().int().nonnegative().optional(),
  end_line: z.number().int().nonnegative(),
  end_column: z.number().int().nonnegative().optional(),
  calls: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  exports: z.array(z.string()).default([]),
}).strict();

const atlasAstEvidenceEdgeSchema = z.object({
  from_evidence_key: id,
  to_evidence_key: id,
  type: z.string().min(1),
  evidence_start_line: z.number().int().nonnegative().optional(),
  evidence_start_column: z.number().int().nonnegative().optional(),
  evidence_end_line: z.number().int().nonnegative().optional(),
  evidence_end_column: z.number().int().nonnegative().optional(),
  resolved: z.boolean().default(false),
  resolution: z.string().nullable().optional(),
}).strict();

export const atlasAstEvidenceV1Schema = z.object({
  schema: z.literal('atlas.ast.evidence.v1'),
  engine: z.string().min(1),
  engine_version: z.string().min(1),
  language: z.string().min(1),
  file_path: z.string().min(1),
  source_revision: revision,
  chunks: z.array(atlasAstEvidenceChunkSchema),
  edges: z.array(atlasAstEvidenceEdgeSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
  error_tag: z.string().nullable().optional(),
  syntax_status: z.string().nullable().optional(),
}).strict();

export const chunkerEvidenceAdapterReceiptSchema = z.object({
  schema: z.literal('atlas.chunker-evidence-adapter-receipt.v1').default('atlas.chunker-evidence-adapter-receipt.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  chunk_count: z.number().int().nonnegative(),
  xref_edge_count: z.number().int().nonnegative(),
  native_node_id_count: z.number().int().nonnegative(),
  native_file_id_count: z.number().int().nonnegative(),
  native_chunk_id_count: z.number().int().nonnegative(),
  native_symbol_id_count: z.number().int().nonnegative(),
  compatibility_node_id_count: z.number().int().nonnegative(),
  compatibility_file_id_count: z.number().int().nonnegative(),
  compatibility_chunk_id_count: z.number().int().nonnegative(),
  strict_native_provenance: z.boolean(),
  diagnostics: z.array(z.string()).default([]),
  canonical_identity_created: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type AtlasAstEvidenceV1 = z.infer<typeof atlasAstEvidenceV1Schema>;
export type ChunkerEvidenceAdapterReceiptV1 = z.infer<typeof chunkerEvidenceAdapterReceiptSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sliceHash(source: string, startByte: number, endByte: number): string {
  const bytes = Buffer.from(source, 'utf8');
  return sha256(bytes.subarray(startByte, endByte).toString('utf8'));
}

function compatibilityId(kind: string, parts: unknown[]): string {
  return `compat:${kind}:${sha256(JSON.stringify(parts)).slice(0, 40)}`;
}

/**
 * Bridges the existing 8095 `atlas.ast.evidence.v1` response into the newer
 * structural extraction fabric without pretending that compatibility IDs are
 * native Consiliency IDs or Atlas canonical identities.
 *
 * Strict mode requires native node_id + file_id + chunk_id for every chunk.
 * `symbol_id` is intentionally optional: a named definition may still become a
 * noncanonical GIS nomination and be reconciled by the canonical symbol registry.
 */
export function adaptAtlasAstEvidenceToStructuralInput(input: {
  evidence: AtlasAstEvidenceV1;
  source_text: string;
  workspace_revision: string;
  chunker_revision: string;
  ast_grep_revision: string;
  langextract_revision: string;
  ast_grep_observations?: StructuralExtractionInputV1['ast_grep_observations'];
  langextract_observations?: StructuralExtractionInputV1['langextract_observations'];
  allow_compatibility_ids?: boolean;
  producer_revision: string;
}): { structural_input: StructuralExtractionInputV1; receipt: ChunkerEvidenceAdapterReceiptV1 } {
  const evidence = atlasAstEvidenceV1Schema.parse(input.evidence);
  const allowCompatibilityIds = input.allow_compatibility_ids ?? true;
  let nativeNodeIds = 0;
  let nativeFileIds = 0;
  let nativeChunkIds = 0;
  let nativeSymbolIds = 0;
  let compatibilityNodeIds = 0;
  let compatibilityFileIds = 0;
  let compatibilityChunkIds = 0;
  const diagnostics = [...evidence.diagnostics];

  const compatibilityFileId = compatibilityId('file', [evidence.file_path, evidence.source_revision]);
  const chunks = evidence.chunks.map((chunk, index) => {
    if (chunk.end_byte < chunk.start_byte) {
      throw new Error(`CHUNK_SPAN_INVALID:${evidence.file_path}:${index}`);
    }

    let upstreamNodeId = chunk.upstream_node_id;
    if (upstreamNodeId) {
      nativeNodeIds += 1;
    } else {
      if (!allowCompatibilityIds) {
        throw new Error(`CHUNKER_NATIVE_NODE_ID_REQUIRED:${evidence.file_path}:${index}`);
      }
      upstreamNodeId = compatibilityId('node', [
        evidence.file_path,
        evidence.source_revision,
        chunk.node_type,
        chunk.kind,
        chunk.name ?? '',
        chunk.start_byte,
        chunk.end_byte,
      ]);
      compatibilityNodeIds += 1;
    }

    let upstreamFileId = chunk.upstream_file_id;
    if (upstreamFileId) {
      nativeFileIds += 1;
    } else {
      if (!allowCompatibilityIds) {
        throw new Error(`CHUNKER_NATIVE_FILE_ID_REQUIRED:${evidence.file_path}:${index}`);
      }
      upstreamFileId = compatibilityFileId;
      compatibilityFileIds += 1;
    }

    let upstreamChunkId = chunk.upstream_chunk_id;
    if (upstreamChunkId) {
      nativeChunkIds += 1;
    } else {
      if (!allowCompatibilityIds) {
        throw new Error(`CHUNKER_NATIVE_CHUNK_ID_REQUIRED:${evidence.file_path}:${index}`);
      }
      upstreamChunkId = compatibilityId('chunk', [upstreamNodeId, chunk.start_byte, chunk.end_byte]);
      compatibilityChunkIds += 1;
    }

    if (chunk.upstream_symbol_id) nativeSymbolIds += 1;

    return {
      upstream_node_id: upstreamNodeId,
      upstream_file_id: upstreamFileId,
      upstream_symbol_id: chunk.upstream_symbol_id,
      upstream_chunk_id: upstreamChunkId,
      source_ref: evidence.file_path,
      language: evidence.language,
      node_type: chunk.node_type,
      kind: chunk.kind,
      symbol_name: chunk.name ?? undefined,
      parent_route: chunk.parent_route ?? [],
      parent_context: chunk.parent_context ?? undefined,
      byte_start: chunk.start_byte,
      byte_end: chunk.end_byte,
      start_line: chunk.start_line,
      end_line: chunk.end_line,
      content_hash: sliceHash(input.source_text, chunk.start_byte, chunk.end_byte),
      calls: chunk.calls,
      imports: chunk.imports,
      exports: chunk.exports,
    };
  });

  if (compatibilityNodeIds > 0) diagnostics.push(`COMPATIBILITY_NODE_IDS:${compatibilityNodeIds}`);
  if (compatibilityFileIds > 0) diagnostics.push(`COMPATIBILITY_FILE_IDS:${compatibilityFileIds}`);
  if (compatibilityChunkIds > 0) diagnostics.push(`COMPATIBILITY_CHUNK_IDS:${compatibilityChunkIds}`);

  const structuralInput = structuralExtractionInputSchema.parse({
    source_ref: evidence.file_path,
    source_revision: evidence.source_revision,
    workspace_revision: input.workspace_revision,
    language: evidence.language,
    chunker_revision: input.chunker_revision,
    ast_grep_revision: input.ast_grep_revision,
    langextract_revision: input.langextract_revision,
    chunks,
    xref_edges: evidence.edges.map((edge) => ({
      src: edge.from_evidence_key,
      dst: edge.to_evidence_key,
      type: edge.type,
      weight: 1,
    })),
    ast_grep_observations: input.ast_grep_observations ?? [],
    langextract_observations: input.langextract_observations ?? [],
    diagnostics,
  });

  return {
    structural_input: structuralInput,
    receipt: chunkerEvidenceAdapterReceiptSchema.parse({
      source_ref: evidence.file_path,
      source_revision: evidence.source_revision,
      chunk_count: chunks.length,
      xref_edge_count: evidence.edges.length,
      native_node_id_count: nativeNodeIds,
      native_file_id_count: nativeFileIds,
      native_chunk_id_count: nativeChunkIds,
      native_symbol_id_count: nativeSymbolIds,
      compatibility_node_id_count: compatibilityNodeIds,
      compatibility_file_id_count: compatibilityFileIds,
      compatibility_chunk_id_count: compatibilityChunkIds,
      strict_native_provenance: !allowCompatibilityIds,
      diagnostics,
      canonical_identity_created: false,
      producer_revision: input.producer_revision,
    }),
  };
}
