import { z } from 'zod';

/**
 * RepresentationFitV1 answers "what is this value?" before asking an ANN,
 * graph, or neural model to process it. Exact identities and opaque digests
 * are intentionally kept out of semantic similarity space.
 */
export const AtlasValueKindSchema = z.enum([
  'SYMBOL',
  'IDENTIFIER',
  'PATH',
  'HEX_BYTES',
  'HASH_DIGEST',
  'SCALAR',
  'TUPLE',
  'TABLE',
  'TABLE_ROW',
  'TABLE_COLUMN',
  'JSON_OBJECT',
  'MSGPACK_OBJECT',
  'BYTEA_ARTIFACT',
  'TEXT_SPAN',
  'AST_SUBTREE',
  'DENSE_VECTOR',
  'SPARSE_VECTOR',
  'GRAPH_NODE',
  'GRAPH_EDGE',
]);
export type AtlasValueKind = z.infer<typeof AtlasValueKindSchema>;

export const PhysicalRepresentationSchema = z.enum([
  'UTF8',
  'FIXED_BYTES',
  'FLOAT32',
  'INT32',
  'ARROW',
  'MSGPACK',
  'JSON',
  'BYTEA',
  'COO',
  'CSR',
  'CSC',
]);
export type PhysicalRepresentation = z.infer<typeof PhysicalRepresentationSchema>;

export const ComparisonSemanticsSchema = z.enum([
  'EXACT',
  'LEXICOGRAPHICAL',
  'NUMERIC',
  'COSINE',
  'INNER_PRODUCT',
  'L2',
  'STRUCTURAL',
  'COLUMNAR',
  'NONE',
]);
export type ComparisonSemantics = z.infer<typeof ComparisonSemanticsSchema>;

export const RepresentationUseSchema = z.enum([
  'IDENTITY',
  'EXACT_FILTER',
  'SORT_KEY',
  'SEMANTIC_SEARCH',
  'ROUTING',
  'GRAPH_ANALYSIS',
  'GPU_BATCH',
  'PERSISTENCE',
  'TRANSPORT',
]);
export type RepresentationUse = z.infer<typeof RepresentationUseSchema>;

export const RepresentationFitV1Schema = z.object({
  schema: z.literal('atlas.representation-fit.v1'),
  kind: AtlasValueKindSchema,
  canonicalPhysical: PhysicalRepresentationSchema,
  comparison: ComparisonSemanticsSchema,
  uses: z.array(RepresentationUseSchema).min(1),
  semanticEmbeddingAllowed: z.boolean(),
  gpuBatchAllowed: z.boolean(),
  requiresTypeManifest: z.boolean(),
  notes: z.array(z.string().min(1)).max(12),
}).strict();
export type RepresentationFitV1 = z.infer<typeof RepresentationFitV1Schema>;

const EXACT_STRING_USES: RepresentationUse[] = ['IDENTITY', 'EXACT_FILTER', 'SORT_KEY', 'PERSISTENCE'];

export function representationFit(kind: AtlasValueKind): RepresentationFitV1 {
  switch (kind) {
    case 'SYMBOL':
    case 'IDENTIFIER':
    case 'PATH':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'UTF8',
        comparison: 'LEXICOGRAPHICAL',
        uses: [...EXACT_STRING_USES, 'GRAPH_ANALYSIS'],
        semanticEmbeddingAllowed: kind !== 'IDENTIFIER',
        gpuBatchAllowed: false,
        requiresTypeManifest: false,
        notes: [
          'Canonical UTF-8 spelling remains identity; hashes are accelerators/evidence only.',
          'Embed descriptive context around a symbol or path, not the bare identifier when semantic meaning is required.',
        ],
      };

    case 'HEX_BYTES':
    case 'HASH_DIGEST':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'FIXED_BYTES',
        comparison: 'EXACT',
        uses: ['IDENTITY', 'EXACT_FILTER', 'SORT_KEY', 'PERSISTENCE', 'TRANSPORT'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: [
          'Treat digest/hex bytes as opaque exact data; semantic vector distance is meaningless.',
          'Store algorithm, byte width, and encoding alongside the bytes.',
        ],
      };

    case 'SCALAR':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'FLOAT32',
        comparison: 'NUMERIC',
        uses: ['EXACT_FILTER', 'SORT_KEY', 'GPU_BATCH', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: ['Preserve source type/range in the manifest even when batching as float32.'],
      };

    case 'TUPLE':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'MSGPACK',
        comparison: 'STRUCTURAL',
        uses: ['EXACT_FILTER', 'SORT_KEY', 'TRANSPORT', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: false,
        requiresTypeManifest: true,
        notes: [
          'Keep arity and per-position type; do not flatten heterogeneous tuples into a neural vector without an explicit projection manifest.',
        ],
      };

    case 'TABLE':
    case 'TABLE_ROW':
    case 'TABLE_COLUMN':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'ARROW',
        comparison: 'COLUMNAR',
        uses: ['EXACT_FILTER', 'SORT_KEY', 'GPU_BATCH', 'PERSISTENCE', 'TRANSPORT'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: [
          'Arrow/columnar layout is preferred for typed batches; semantic text columns may be embedded as a separate derived representation.',
        ],
      };

    case 'JSON_OBJECT':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'JSON',
        comparison: 'STRUCTURAL',
        uses: ['EXACT_FILTER', 'TRANSPORT', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: false,
        requiresTypeManifest: true,
        notes: ['Canonical hashes must be computed from an explicit canonical object representation, not incidental JSON key order.'],
      };

    case 'MSGPACK_OBJECT':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'MSGPACK',
        comparison: 'STRUCTURAL',
        uses: ['TRANSPORT', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: false,
        requiresTypeManifest: true,
        notes: ['MessagePack is a transport/storage encoding; schema-level meaning remains external to the byte stream.'],
      };

    case 'BYTEA_ARTIFACT':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'BYTEA',
        comparison: 'EXACT',
        uses: ['PERSISTENCE', 'TRANSPORT', 'EXACT_FILTER'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: false,
        requiresTypeManifest: true,
        notes: ['BYTEA stores immutable packed artifacts; dimensions, dtype, revisions, and checksum must remain outside the blob.'],
      };

    case 'TEXT_SPAN':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'UTF8',
        comparison: 'COSINE',
        uses: ['SEMANTIC_SEARCH', 'EXACT_FILTER', 'PERSISTENCE'],
        semanticEmbeddingAllowed: true,
        gpuBatchAllowed: false,
        requiresTypeManifest: false,
        notes: ['Text remains source evidence; semantic_768 is a derived search representation.'],
      };

    case 'AST_SUBTREE':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'MSGPACK',
        comparison: 'STRUCTURAL',
        uses: ['GRAPH_ANALYSIS', 'ROUTING', 'PERSISTENCE'],
        semanticEmbeddingAllowed: true,
        gpuBatchAllowed: false,
        requiresTypeManifest: true,
        notes: ['Preserve grammar revision, node kinds, child-index path, byte spans, and canonical symbol linkage.'],
      };

    case 'DENSE_VECTOR':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'FLOAT32',
        comparison: 'COSINE',
        uses: ['SEMANTIC_SEARCH', 'ROUTING', 'GPU_BATCH', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: ['Record representation id, dimension, model/encoder revision, normalization, and metric.'],
      };

    case 'SPARSE_VECTOR':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'CSR',
        comparison: 'INNER_PRODUCT',
        uses: ['SEMANTIC_SEARCH', 'GPU_BATCH', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: ['CSR is the default compute layout; COO is interchange/build and CSC is useful for incoming/transpose-oriented operations.'],
      };

    case 'GRAPH_NODE':
    case 'GRAPH_EDGE':
      return {
        schema: 'atlas.representation-fit.v1',
        kind,
        canonicalPhysical: 'COO',
        comparison: 'STRUCTURAL',
        uses: ['GRAPH_ANALYSIS', 'ROUTING', 'GPU_BATCH', 'PERSISTENCE'],
        semanticEmbeddingAllowed: false,
        gpuBatchAllowed: true,
        requiresTypeManifest: true,
        notes: ['Canonical graph identity is typed IDs/edges; COO/CSR/CSC are executor layouts, not independent truth.'],
      };
  }
}

export function shouldEmbedBareValue(kind: AtlasValueKind): boolean {
  return representationFit(kind).semanticEmbeddingAllowed;
}
