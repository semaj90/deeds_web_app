import { z } from 'zod';
import crypto from 'crypto';

export const VectorNameEnum = z.enum([
  'semantic_768',
  'semantic_mrl_512',
  'semantic_mrl_256',
  'semantic_mrl_128',
  'dense_384',
  'dense_768_legacy',
  'title_384',
  'summary_384',
  'symbol_384',
  'ontology_384',
  'latent_128',
  'latent_64',
  'late_interaction',
  'bm42_sparse',
]);
export type VectorName = z.infer<typeof VectorNameEnum>;

export const VectorRepresentationEnum = z.enum(['dense', 'sparse', 'multivector']);
export type VectorRepresentation = z.infer<typeof VectorRepresentationEnum>;

export const DistanceMetricEnum = z.enum(['Cosine', 'Dot', 'Euclid', 'Manhattan']);
export type DistanceMetric = z.infer<typeof DistanceMetricEnum>;

export const VectorStatusEnum = z.enum(['ACTIVE', 'REFERENCE_ONLY', 'MIGRATION_SOURCE', 'SUPERSEDED', 'ARCHIVED']);
export type VectorStatus = z.infer<typeof VectorStatusEnum>;

export const VectorManifestSchema = z.object({
  vectorName: VectorNameEnum,
  model: z.string().min(1),
  modelRevision: z.string().optional(),
  dimensions: z.number().int().positive(),
  representation: VectorRepresentationEnum,
  distance: DistanceMetricEnum,
  normalized: z.boolean(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  status: VectorStatusEnum.default('ACTIVE'),
  activatedAt: z.string().datetime().optional(),
  deprecatedAt: z.string().datetime().optional(),
  supersededAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
  supersededBy: VectorNameEnum.optional().describe('If SUPERSEDED, which vector replaces this one'),
  postgresColumn: z.string().optional().describe('Source Postgres column (e.g., content_embedding_384)'),
  qdrantVectorSlot: z.string().optional().describe('Qdrant named vector slot (e.g., dense_384)'),
});

export type VectorManifest = z.infer<typeof VectorManifestSchema>;

/**
 * Deterministic SHA256 hash of vector manifest (sorted JSON, UTF-8, no whitespace).
 */
export function hashVectorManifest(manifest: VectorManifest): string {
  const canonical = JSON.stringify(
    JSON.parse(JSON.stringify(manifest)),
    Object.keys(manifest).sort(),
    0
  );
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Validate and construct a vector manifest.
 */
export function createVectorManifest(input: unknown): VectorManifest {
  const validated = VectorManifestSchema.parse(input);
  return {
    ...validated,
    createdAt: validated.createdAt || new Date().toISOString(),
  };
}

/**
 * Canonical vector manifest instances (static registry).
 * This is the single source of truth for all vector representations.
 * Go services must embed this registry at build time to remain in sync.
 */
export const VECTOR_MANIFESTS = {
  dense384: {
    vectorName: 'dense_384' as const,
    model: 'embeddinggemma:latest',
    modelRevision: '1.0',
    dimensions: 384,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    activatedAt: '2026-07-15T00:00:00Z',
    postgresColumn: 'content_embedding_384',
    qdrantVectorSlot: 'dense_384',
    supersededBy: 'semantic_768' as const,
  },
  dense768Legacy: {
    vectorName: 'dense_768_legacy' as const,
    model: 'embeddinggemma:native',
    modelRevision: '1.0',
    dimensions: 768,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    activatedAt: '2026-06-01T00:00:00Z',
    deprecatedAt: '2026-07-15T00:00:00Z',
    supersededAt: '2026-08-01T00:00:00Z',
    supersededBy: 'semantic_768' as const,
    postgresColumn: 'content_embedding_768',
    qdrantVectorSlot: 'dense_768_legacy',
  },
  semantic768: {
    vectorName: 'semantic_768' as const,
    model: 'google/embeddinggemma-300m',
    modelRevision: 'UNBOUND',
    dimensions: 768,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'ACTIVE' as const,
    qdrantVectorSlot: 'semantic_768',
    postgresColumn: 'content_embedding_768',
  },
  semanticMrl512: {
    vectorName: 'semantic_mrl_512' as const,
    model: 'google/embeddinggemma-300m',
    modelRevision: 'UNBOUND',
    dimensions: 512,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    supersededBy: 'semantic_768' as const,
  },
  semanticMrl256: {
    vectorName: 'semantic_mrl_256' as const,
    model: 'google/embeddinggemma-300m',
    modelRevision: 'UNBOUND',
    dimensions: 256,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    supersededBy: 'semantic_768' as const,
  },
  semanticMrl128: {
    vectorName: 'semantic_mrl_128' as const,
    model: 'google/embeddinggemma-300m',
    modelRevision: 'UNBOUND',
    dimensions: 128,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    supersededBy: 'semantic_768' as const,
  },
  title384: {
    vectorName: 'title_384' as const,
    model: 'embeddinggemma:title',
    modelRevision: '1.0',
    dimensions: 384,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'REFERENCE_ONLY' as const,
    activatedAt: '2026-08-01T00:00:00Z',
    postgresColumn: undefined,
    qdrantVectorSlot: 'title_384',
  },
  latent64: {
    vectorName: 'latent_64' as const,
    model: 'atlas-autoencoder-768x64-v1',
    modelRevision: '1.0',
    dimensions: 64,
    representation: 'dense' as const,
    distance: 'Cosine' as const,
    normalized: true,
    contentSha256: '',
    workspaceRevision: '',
    status: 'ACTIVE' as const,
    activatedAt: '2026-07-01T00:00:00Z',
    postgresColumn: 'latent_64',
    qdrantVectorSlot: 'latent_64',
  },
  bm42Sparse: {
    vectorName: 'bm42_sparse' as const,
    model: 'bm42:latest',
    modelRevision: '1.0',
    dimensions: 8192,
    representation: 'sparse' as const,
    distance: 'Dot' as const,
    normalized: false,
    contentSha256: '',
    workspaceRevision: '',
    status: 'ACTIVE' as const,
    activatedAt: '2026-07-20T00:00:00Z',
    postgresColumn: 'embedding_sparse',
    qdrantVectorSlot: 'bm42_sparse',
  },
} as const satisfies Record<string, Omit<VectorManifest, 'createdAt'>>;

/**
 * Lookup vector manifest by name.
 * Used by all consumers (TypeScript, Go via JSON export, etc.)
 */
export function getVectorManifest(vectorName: VectorName): typeof VECTOR_MANIFESTS[keyof typeof VECTOR_MANIFESTS] | undefined {
  for (const manifest of Object.values(VECTOR_MANIFESTS)) {
    if (manifest.vectorName === vectorName) return manifest;
  }
  return undefined;
}

/**
 * Export canonical registry as JSON for Go embedding at build time.
 * Build system calls: `node -e "console.log(JSON.stringify(getVectorRegistryJSON()))"`
 * Then embeds in Go binary to avoid hardcoded defaults.
 */
export function getVectorRegistryJSON() {
  return {
    schemaVersion: '1.0.0',
    lastUpdated: new Date().toISOString(),
    canonicalSource: 'packages/semantic-contracts/src/vector-manifest.ts',
    vectors: VECTOR_MANIFESTS,
    collectionNames: {
      codebase_chunks_768: 'Primary semantic search collection (holds all named vectors)',
      codebase_chunks_384: 'Legacy 384-dim collection (read-only fallback)',
    },
  };
}
