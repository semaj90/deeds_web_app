import { z } from 'zod';
import { sha256HexSchema } from '../prefill/canonical-hash-v1.js';

/**
 * SEM768-REPRESENTATION-CONTRACT-01
 *
 * Formalizes what a `codebase_chunk_index.content_embedding` row actually
 * proves, without creating a new table or migration. Per SEM768-STORAGE-OWNER-01
 * (docs/reports/sem768-storage-owner-01.json), that column is the confirmed
 * physical owner of the logical `semantic_768` representation (55,169/55,853
 * rows populated, HNSW m=16/ef_construction=200). This contract does not
 * change that storage — it names it precisely and separates two questions
 * that are easy to conflate:
 *
 *   1. Where does the vector physically live? (chunkIndexId, storage.*)
 *   2. Is this row's full provenance chain independently PROVEN, such that
 *      it can be trusted as canonical Atlas identity? (canonicalChunkId,
 *      sourceRevision, workspaceRevision, packetKey, model/tokenizer
 *      revision, checksums)
 *
 * "The vector lives in the canonical physical semantic column" does NOT
 * imply "this row's lineage is proven." Those are independent facts. A row
 * can have `storage.column === 'content_embedding'` (always true for every
 * row built from this table) while `canonicalAuthority === false` (true for
 * most rows today — see SEM768-ADMISSION-DRY-01).
 *
 * `canonicalChunkId` MUST NOT be inferred from `codebase_chunk_index.id`,
 * `content_hash`, `source_ref`, a Qdrant point ID, `tree_node_id`, or a
 * CandidateOrdinal. Those are all real, useful coordinates, but none of them
 * is an independently-resolved canonical Atlas chunk identity — conflating
 * "a stable-looking column" with "proven canonical identity" is exactly the
 * failure mode this contract exists to prevent.
 *
 * Per SEM768-CANONICAL-CHUNK-OWNER-01 (docs/reports/sem768-canonical-chunk-owner-01.json):
 * `canonical_chunks` (document_id/chunk_id-keyed) is confirmed EMPTY and
 * wrong-domain — do not check it. Two REAL, populated resolvers exist
 * instead, uncoordinated with each other (zero overlap found in a 128-row
 * sample):
 *   - `atlas_packet_chunk_lineage` (chunk_row_id -> codebase_chunk_index.id):
 *     rows with revision_status='PROVEN' (DB-CHECK-enforced non-null
 *     source_revision) give canonicalChunkId (its own canonical_chunk_id
 *     column, format `fullrepo:<path>:<line>`) + packetKey + sourceRef +
 *     sourceRevision together. This is the stronger candidate — prefer it.
 *   - `atlas_chunk_packet_identity_links` (chunk_index_id -> codebase_chunk_index.id):
 *     rows with confidence='EXACT' give a candidate canonical_packet_key,
 *     but the table's OWN `canonical_writes_allowed` boolean gates real
 *     authorization — an EXACT match with canonical_writes_allowed=false
 *     is evidence toward future canonical status, NOT canonicalChunkId=PROVEN
 *     today. Respect that flag; do not bypass it.
 * `atlas_packets.workspace_revision` (joined via packet_key from the lineage
 * table above) is a real, indexed integer column, but was found uniformly
 * `0` (its own DEFAULT, never actually set) for every resolved row checked —
 * present and joinable, but not yet a proven value. `workspace_id` (string)
 * is real and meaningfully differentiated, usable as a coarse marker.
 */

export const SEMANTIC_REPRESENTATION_SCHEMA_V1 = 'atlas.semantic-representation.v1' as const;

export const SemanticLineageStatusV1Schema = z.enum([
  /** Every provenance field independently proven — canonicalAuthority may be true. */
  'REVISION_QUALIFIED',
  /** No independently-resolved canonical Atlas chunk identity for this row. */
  'CANONICAL_CHUNK_UNPROVEN',
  /** packetKey absent, or present but not resolved via a canonical resolver. */
  'PACKET_BINDING_UNPROVEN',
  /**
   * Source-of-origin provenance (sourceRevision and/or workspaceRevision)
   * cannot be proven for this row. codebase_chunk_index has no
   * workspace_id/workspace_revision column at all, so this status also
   * covers what SEM768-ADMISSION-DRY-01's richer per-row classification
   * calls WORKSPACE_REVISION_UNPROVEN — both collapse to this single
   * summary value here because the contract's lineageStatus is a rollup,
   * not the full diagnostic breakdown (that breakdown belongs in the
   * admission-dry-run report, not in this type).
   */
  'SOURCE_REVISION_UNPROVEN',
]);

export type SemanticLineageStatusV1 = z.infer<typeof SemanticLineageStatusV1Schema>;

/**
 * Per SEM768-INPUT-PROVENANCE-OWNER-01 (docs/reports/sem768-input-provenance-owner-01.json):
 * live codebase_chunk_index.content_hash values are NOT uniformly full
 * 64-hex SHA-256 digests. Two real producer families coexist:
 *   - 'sha256_16': PROVEN empirically (byte-exact match against a real row)
 *     to be sha256(content).slice(0,16) — a well-established, deliberate,
 *     repo-wide convention (sha256First16/sha16/etc, dozens of call sites),
 *     not corruption. Weaker entropy (64 bits) than a full digest, but a
 *     real, deterministic, reproducible checksum.
 *   - 'unqualified': the 64-hex minority family's exact hash input was
 *     tested against 8 real hypotheses (content, content+relPath in 4
 *     orders/separators, JSON-stringified, trimmed) and none matched —
 *     honestly unresolved rather than assumed to be full sha256(content).
 * A future producer that proves a genuine full-content sha256 digest may
 * use 'sha256'. Do not require sha256HexSchema (64-hex) for inputDigest —
 * that would silently reject the majority real producer family.
 */
export const InputDigestAlgorithmV1Schema = z.enum(['sha256', 'sha256_16', 'unqualified']);
export type InputDigestAlgorithmV1 = z.infer<typeof InputDigestAlgorithmV1Schema>;

export const InputDigestV1Schema = z
  .object({
    algorithm: InputDigestAlgorithmV1Schema,
    value: z.string().regex(/^[a-f0-9]+$/i).min(1),
    producerRevision: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.algorithm === 'sha256' && value.value.length !== 64) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'algorithm="sha256" requires a 64-hex-character value.' });
    }
    if (value.algorithm === 'sha256_16' && value.value.length !== 16) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'algorithm="sha256_16" requires a 16-hex-character value.' });
    }
  });
export type InputDigestV1 = z.infer<typeof InputDigestV1Schema>;

const optionalNonEmpty = z.string().min(1).optional();

export const SemanticRepresentationV1Schema = z
  .object({
    schema: z.literal(SEMANTIC_REPRESENTATION_SCHEMA_V1),

    // Physical storage coordinate. Always resolvable — every row selected
    // from codebase_chunk_index has one. NOT a claim of canonical identity.
    chunkIndexId: z.string().uuid(),

    // Canonical Atlas identity — populated ONLY when independently resolved
    // against a real identity registry (see the module docstring for what
    // does NOT count as resolution).
    canonicalChunkId: optionalNonEmpty,
    packetKey: optionalNonEmpty,

    sourceRef: z.string().min(1),
    sourceRevision: optionalNonEmpty,
    workspaceRevision: optionalNonEmpty,

    representationId: z.literal('semantic_768'),
    representationRevision: optionalNonEmpty,

    modelId: z.literal('embeddinggemma'),
    modelRevision: optionalNonEmpty,
    tokenizerRevision: optionalNonEmpty,

    dimensions: z.literal(768),
    normalized: z.literal(true),

    inputDigest: InputDigestV1Schema.optional(),
    vectorChecksum: sha256HexSchema.optional(),

    storage: z
      .object({
        table: z.literal('codebase_chunk_index'),
        column: z.literal('content_embedding'),
        storageType: z.literal('halfvec(768)'),
      })
      .strict(),

    lineageStatus: SemanticLineageStatusV1Schema,
    canonicalAuthority: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fullyProven =
      !!value.canonicalChunkId &&
      !!value.sourceRevision &&
      !!value.workspaceRevision &&
      !!value.representationRevision &&
      !!value.modelRevision &&
      !!value.tokenizerRevision &&
      !!value.inputDigest &&
      !!value.vectorChecksum;

    // canonicalAuthority=true is permitted ONLY for fully revision-qualified
    // rows. This is schema-enforced, not merely a builder convention, so a
    // caller cannot construct a canonical-authority claim by hand-assembling
    // the object and skipping the builder. inputDigest.algorithm='unqualified'
    // does NOT count as proven (see InputDigestV1's docstring) — a caller
    // must have a 'sha256' or 'sha256_16' digest to reach canonicalAuthority.
    const inputDigestProven = !!value.inputDigest && value.inputDigest.algorithm !== 'unqualified';
    if (value.canonicalAuthority && (!fullyProven || !inputDigestProven)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['canonicalAuthority'],
        message:
          'canonicalAuthority=true requires canonicalChunkId, sourceRevision, workspaceRevision, ' +
          'representationRevision, modelRevision, tokenizerRevision, a non-"unqualified" inputDigest, ' +
          'and vectorChecksum to all be present — physical storage ownership of content_embedding alone ' +
          'does not qualify.',
      });
    }
    if (value.canonicalAuthority && value.lineageStatus !== 'REVISION_QUALIFIED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineageStatus'],
        message: 'canonicalAuthority=true requires lineageStatus="REVISION_QUALIFIED".',
      });
    }
    if (!fullyProven && value.lineageStatus === 'REVISION_QUALIFIED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineageStatus'],
        message: 'lineageStatus="REVISION_QUALIFIED" requires every provenance field to be present.',
      });
    }
  });

export type SemanticRepresentationV1 = z.infer<typeof SemanticRepresentationV1Schema>;

export type SemanticRepresentationInputV1 = Omit<
  SemanticRepresentationV1,
  'schema' | 'storage' | 'lineageStatus' | 'canonicalAuthority' | 'representationId' | 'modelId' | 'dimensions' | 'normalized'
> & {
  lineageStatus?: SemanticLineageStatusV1;
  canonicalAuthority?: boolean;
};

/**
 * Derives lineageStatus from which provenance fields are present, in the
 * priority order the module docstring describes (canonical-chunk identity
 * is checked first — without it, nothing downstream can be trusted as
 * canonical no matter how complete the rest of the chain is).
 */
export function deriveSemanticLineageStatusV1(
  input: Pick<
    SemanticRepresentationInputV1,
    'canonicalChunkId' | 'packetKey' | 'sourceRevision' | 'workspaceRevision' | 'representationRevision' | 'modelRevision' | 'tokenizerRevision' | 'inputDigest' | 'vectorChecksum'
  >,
): SemanticLineageStatusV1 {
  if (!input.canonicalChunkId) return 'CANONICAL_CHUNK_UNPROVEN';
  if (!input.packetKey) return 'PACKET_BINDING_UNPROVEN';
  if (!input.sourceRevision || !input.workspaceRevision) return 'SOURCE_REVISION_UNPROVEN';
  if (
    !input.representationRevision ||
    !input.modelRevision ||
    !input.tokenizerRevision ||
    !input.inputDigest ||
    input.inputDigest.algorithm === 'unqualified' ||
    !input.vectorChecksum
  ) {
    return 'SOURCE_REVISION_UNPROVEN';
  }
  return 'REVISION_QUALIFIED';
}

/**
 * Builds a SemanticRepresentationV1 for one codebase_chunk_index row.
 * `chunkIndexId` and `sourceRef` and the fixed storage/representation/model
 * fields are the only required inputs — everything else is optional and,
 * when absent, the schema's own superRefine forces canonicalAuthority=false.
 */
export function buildSemanticRepresentationV1(
  input: SemanticRepresentationInputV1,
): SemanticRepresentationV1 {
  const lineageStatus = input.lineageStatus ?? deriveSemanticLineageStatusV1(input);
  const canonicalAuthority = input.canonicalAuthority ?? lineageStatus === 'REVISION_QUALIFIED';

  return SemanticRepresentationV1Schema.parse({
    schema: SEMANTIC_REPRESENTATION_SCHEMA_V1,
    chunkIndexId: input.chunkIndexId,
    canonicalChunkId: input.canonicalChunkId,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    representationId: 'semantic_768' as const,
    representationRevision: input.representationRevision,
    modelId: 'embeddinggemma' as const,
    modelRevision: input.modelRevision,
    tokenizerRevision: input.tokenizerRevision,
    dimensions: 768 as const,
    normalized: true as const,
    inputDigest: input.inputDigest,
    vectorChecksum: input.vectorChecksum,
    storage: {
      table: 'codebase_chunk_index' as const,
      column: 'content_embedding' as const,
      storageType: 'halfvec(768)' as const,
    },
    lineageStatus,
    canonicalAuthority,
  });
}
