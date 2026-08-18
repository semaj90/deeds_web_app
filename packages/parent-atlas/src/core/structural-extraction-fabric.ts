import { z } from 'zod';
import {
  astGrepObservationSchema,
  deriveUpstreamSymbolNominationKey,
  groundedLangExtractObservationSchema,
  structuralReferenceFactSchema,
  structuralSymbolNominationSchema,
  treesitterChunkerChunkSchema,
  treesitterChunkerXrefEdgeSchema,
  type AstGrepObservationV1,
  type GroundedLangExtractObservationV1,
  type StructuralReferenceFactV1,
  type StructuralSymbolNominationV1,
  type TreesitterChunkerChunkV1,
  type TreesitterChunkerXrefEdgeV1,
} from './structural-symbol.js';

const revision = z.string().min(1);

export const structuralExtractionProducerSchema = z.enum([
  'treesitter_chunker',
  'ast_grep',
  'langextract',
]);

/**
 * Parent Atlas consumes three evidence producers. None owns canonical Atlas
 * identity. `treesitter-chunker` is the primary code-structure producer;
 * ast-grep and LangExtract enrich its grounded spans/IDs with observations.
 */
export const structuralExtractionInputSchema = z.object({
  schema: z.literal('atlas.structural-extraction-input.v1').default('atlas.structural-extraction-input.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  language: z.string().min(1),
  chunker_revision: revision,
  ast_grep_revision: revision,
  langextract_revision: revision,
  chunks: z.array(treesitterChunkerChunkSchema),
  xref_edges: z.array(treesitterChunkerXrefEdgeSchema).default([]),
  ast_grep_observations: z.array(astGrepObservationSchema).default([]),
  langextract_observations: z.array(groundedLangExtractObservationSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
}).strict();

export const structuralExtractionReceiptSchema = z.object({
  schema: z.literal('atlas.structural-extraction-receipt.v1').default('atlas.structural-extraction-receipt.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  chunk_count: z.number().int().nonnegative(),
  xref_edge_count: z.number().int().nonnegative(),
  symbol_nomination_count: z.number().int().nonnegative(),
  native_symbol_nomination_count: z.number().int().nonnegative(),
  path_affine_symbol_nomination_count: z.number().int().nonnegative(),
  reference_fact_count: z.number().int().nonnegative(),
  unresolved_xref_source_count: z.number().int().nonnegative().default(0),
  ast_grep_observation_count: z.number().int().nonnegative(),
  grounded_langextract_count: z.number().int().nonnegative(),
  rejected_ungrounded_langextract_count: z.number().int().nonnegative(),
  diagnostics: z.array(z.string()).default([]),
  canonical_identity_created: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type StructuralExtractionInputV1 = z.infer<typeof structuralExtractionInputSchema>;
export type StructuralExtractionReceiptV1 = z.infer<typeof structuralExtractionReceiptSchema>;

export type StructuralExtractionFabricResultV1 = {
  chunks: TreesitterChunkerChunkV1[];
  xref_edges: TreesitterChunkerXrefEdgeV1[];
  symbol_nominations: StructuralSymbolNominationV1[];
  reference_facts: StructuralReferenceFactV1[];
  ast_grep_observations: AstGrepObservationV1[];
  langextract_observations: GroundedLangExtractObservationV1[];
  receipt: StructuralExtractionReceiptV1;
};

function mapChunkKindToSymbolKind(kind: string): StructuralSymbolNominationV1['kind'] | null {
  const value = kind.toLowerCase();
  if (value.includes('method')) return 'method';
  if (value.includes('function')) return 'function';
  if (value.includes('class')) return 'class';
  if (value.includes('interface')) return 'interface';
  if (value.includes('enum')) return 'enum';
  if (value.includes('type')) return 'type';
  if (value.includes('module')) return 'module';
  if (value.includes('namespace')) return 'namespace';
  return null;
}

function mapXrefTypeToReferenceKind(type: string): StructuralReferenceFactV1['reference_kind'] | null {
  switch (type.toUpperCase()) {
    case 'CALLS': return 'call';
    case 'IMPORTS': return 'import';
    case 'EXPORTS': return 'export';
    case 'INHERITS': return 'extends';
    case 'IMPLEMENTS': return 'implements';
    case 'REFERENCES': return 'type_ref';
    default: return null;
  }
}

/**
 * Consiliency graph endpoints may be represented by node_id, symbol_id, chunk_id
 * or (for file-scoped edges) file_id. Build one reversible lookup so a richer
 * native endpoint is never discarded merely because it is not the node_id.
 */
function buildChunkIdentityIndex(chunks: readonly TreesitterChunkerChunkV1[]): Map<string, TreesitterChunkerChunkV1> {
  const index = new Map<string, TreesitterChunkerChunkV1>();
  for (const chunk of chunks) {
    for (const key of [
      chunk.upstream_node_id,
      chunk.upstream_symbol_id,
      chunk.upstream_chunk_id,
      chunk.upstream_file_id,
    ]) {
      if (key && !index.has(key)) index.set(key, chunk);
    }
  }
  return index;
}

/**
 * Normalize one `treesitter-chunker` payload plus ast-grep/LangExtract
 * enrichments into Parent Atlas candidate evidence.
 *
 * Important: this function creates nominations/reference facts only. It does
 * not assign stable_symbol_id, symbol_version_id, feature_id or relationship_id.
 */
export function compileStructuralExtractionFabric(
  raw: z.input<typeof structuralExtractionInputSchema>,
  options: { producer_revision: string },
): StructuralExtractionFabricResultV1 {
  const input = structuralExtractionInputSchema.parse(raw);

  const chunks = input.chunks.map((chunk) => treesitterChunkerChunkSchema.parse(chunk));
  const chunkByIdentity = buildChunkIdentityIndex(chunks);

  const symbolNominations: StructuralSymbolNominationV1[] = [];
  let nativeSymbolNominations = 0;
  let pathAffineSymbolNominations = 0;
  for (const chunk of chunks) {
    const kind = mapChunkKindToSymbolKind(chunk.kind || chunk.node_type);
    if (!kind || !chunk.symbol_name) continue;

    const qualifiedName = [...chunk.parent_route, chunk.symbol_name].filter(Boolean).join('::');
    const symbolKey = deriveUpstreamSymbolNominationKey({
      language: input.language,
      source_ref: input.source_ref,
      kind,
      qualified_name: qualifiedName,
      upstream_symbol_id: chunk.upstream_symbol_id,
    });
    if (chunk.upstream_symbol_id) nativeSymbolNominations += 1;
    else pathAffineSymbolNominations += 1;

    symbolNominations.push(structuralSymbolNominationSchema.parse({
      nomination_id: `treesitter-chunker:${chunk.upstream_node_id}:${input.source_revision}`,
      symbol_key: symbolKey,
      identity_status: 'nominated',
      role: 'definition',
      kind,
      language: input.language,
      name: chunk.symbol_name,
      qualified_name: qualifiedName,
      container_qualified_name: chunk.parent_context ?? null,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      workspace_revision: input.workspace_revision,
      upstream_node_id: chunk.upstream_node_id,
      upstream_symbol_id: chunk.upstream_symbol_id,
      upstream_chunk_id: chunk.upstream_chunk_id,
      byte_start: chunk.byte_start,
      byte_end: chunk.byte_end,
      parent_route: chunk.parent_route,
      declaration_hash: chunk.content_hash,
      extractor: 'treesitter_chunker',
      extractor_revision: input.chunker_revision,
    }));
  }

  const referenceFacts: StructuralReferenceFactV1[] = [];
  let unresolvedXrefSources = 0;
  const fabricDiagnostics = [...input.diagnostics];
  for (const edge of input.xref_edges) {
    const referenceKind = mapXrefTypeToReferenceKind(edge.type);
    if (!referenceKind) continue;
    const sourceChunk = chunkByIdentity.get(edge.src);
    const targetChunk = chunkByIdentity.get(edge.dst);
    if (!sourceChunk) {
      unresolvedXrefSources += 1;
      fabricDiagnostics.push(`XREF_SOURCE_UNRESOLVED:${edge.type}:${edge.src}`);
      continue;
    }

    referenceFacts.push(structuralReferenceFactSchema.parse({
      reference_id: `treesitter-chunker-xref:${edge.src}:${edge.dst}:${edge.type}:${input.source_revision}`,
      reference_kind: referenceKind,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      workspace_revision: input.workspace_revision,
      upstream_source_node_id: sourceChunk.upstream_node_id,
      upstream_target_node_id: targetChunk?.upstream_node_id,
      upstream_chunk_id: sourceChunk.upstream_chunk_id,
      target_text: targetChunk?.symbol_name ?? edge.dst,
      resolution_status: 'unresolved',
      captures: {
        xref_type: edge.type,
        xref_weight: String(edge.weight),
        xref_source_key: edge.src,
        xref_target_key: edge.dst,
      },
      evidence_refs: [],
      extractor: 'treesitter_chunker',
      extractor_revision: input.chunker_revision,
    }));
  }

  const groundedLangExtract = input.langextract_observations.map((item) =>
    groundedLangExtractObservationSchema.parse(item));

  return {
    chunks,
    xref_edges: input.xref_edges,
    symbol_nominations: symbolNominations,
    reference_facts: referenceFacts,
    ast_grep_observations: input.ast_grep_observations,
    langextract_observations: groundedLangExtract,
    receipt: structuralExtractionReceiptSchema.parse({
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      workspace_revision: input.workspace_revision,
      chunk_count: chunks.length,
      xref_edge_count: input.xref_edges.length,
      symbol_nomination_count: symbolNominations.length,
      native_symbol_nomination_count: nativeSymbolNominations,
      path_affine_symbol_nomination_count: pathAffineSymbolNominations,
      reference_fact_count: referenceFacts.length,
      unresolved_xref_source_count: unresolvedXrefSources,
      ast_grep_observation_count: input.ast_grep_observations.length,
      grounded_langextract_count: groundedLangExtract.length,
      rejected_ungrounded_langextract_count: 0,
      diagnostics: fabricDiagnostics,
      canonical_identity_created: false,
      producer_revision: options.producer_revision,
    }),
  };
}

export function describeStructuralExtractionFabric(): string {
  return [
    'Consiliency treesitter-chunker is the primary code structural/chunk/XRef evidence producer.',
    'Its node_id, file_id, symbol_id and chunk_id are preserved as upstream provenance and join keys.',
    'XRef endpoints may use any preserved upstream identity key and are normalized back to the source chunk node coordinate.',
    'Named chunks may nominate a path-affine symbol key when a native upstream symbol_id is unavailable; that nomination is never canonical identity.',
    'ast-grep contributes deterministic structural-pattern observations and never creates canonical Atlas identity.',
    'LangExtract contributes grounded semantic/entity/relation observations; char-interval-less results are rejected before canonical evidence.',
    'Parent Atlas canonical promotion alone assigns stable_symbol_id, symbol_version_id, feature_id and relationship_id.',
  ].join(' ');
}
