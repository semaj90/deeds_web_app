import { z } from 'zod';
import { aceCanonicalEnvelopeProjectionSchema } from './ace-packet-v2.js';
import { aceHypergraphPayloadSchema, type AceHypergraphPayloadV1 } from './ace-hypergraph-payload.js';
import { lspResolvedStructuralReferenceSchema } from './lsp-semantic-observation.js';
import { structuralReferenceFactSchema, structuralSymbolNominationSchema } from './structural-symbol.js';
import { sha256HexV1 } from './knowledge/stable-json-v1.js';

/**
 * atlas.ace-packet.v3 — an immutable, revision-qualified COMPOSITION artifact.
 *
 * It composes (never replaces) the v2 packet (canonical envelope projection + hypergraph evidence) with
 * identity, source, semantic, topology, residency and evidence sections. Rules:
 *  - identity comes from PostgreSQL / the canonical envelope; no section may overwrite it;
 *  - every derived section carries an explicit status: CURRENT | HINT | STALE | PENDING;
 *  - a CURRENT section must name the revision that produced it;
 *  - a CURRENT embedding must carry the input digest AND the embedding digest (no vector without input identity);
 *  - vectors are referenced (ordinal / point id), never inlined; centroids are references, not copies;
 *  - request-local material (retrieval scores, ContextManifest, PromptPlan, tool proposals, repair plans)
 *    is NOT part of the durable packet — it lives in ContextManifestV2 / PromptPlanV1 / ace-repair-packet-v1;
 *  - TTL / cache presence is never freshness proof: the checksum + full identity are.
 */

const revision = z.string().min(1);
const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const ACE_SECTION_STATUS_V1 = ['CURRENT', 'HINT', 'STALE', 'PENDING'] as const;
export const aceSectionStatusSchema = z.enum(ACE_SECTION_STATUS_V1);
export type AceSectionStatusV1 = z.infer<typeof aceSectionStatusSchema>;

function section<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    status: aceSectionStatusSchema,
    revision: revision.nullable(),
    evidence_refs: z.array(z.string().min(1)),
    data,
  }).strict().superRefine((value, ctx) => {
    if (value.status === 'CURRENT' && value.revision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a CURRENT section must name its producing revision', path: ['revision'] });
    }
  });
}

export const aceCentroidRefSchema = z.object({
  kind: z.enum(['SOM_BMU', 'KMEANS', 'FEATURE', 'DOMAIN', 'COMMUNITY']),
  artifact_id: z.string().min(1),
  representation_id: z.string().min(1),
  representation_revision: revision,
  artifact_checksum: sha256Prefixed,
  similarity: z.number().min(-1).max(1).nullable(),
}).strict();

export const aceIdentityV3Schema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  workspace_revision: revision,
  source_revision: revision,
  packet_revision: revision,
  producer_revision: revision,
  representation_id: z.string().min(1),
  representation_revision: revision.nullable(),
  feature_revision: revision.nullable(),
  graph_revision: revision.nullable(),
  symbol_version_id: z.string().min(1).nullable(),
  tree_node_id: z.string().min(1).nullable(),
}).strict();

const sourceData = z.object({
  language: z.string().min(1).nullable(),
  source_digest: sha256Prefixed,
  start_byte: z.number().int().nonnegative().nullable(),
  end_byte: z.number().int().nonnegative().nullable(),
  ast_state: z.enum(['NOT_APPLICABLE', 'PARSER_UNAVAILABLE', 'NOT_MATERIALIZED', 'PARSE_FAILED', 'LINEAGE_UNQUALIFIED', 'REVISION_QUALIFIED', 'SYMBOL_RESOLVED']),
}).strict();

const summaryData = z.object({
  text: z.string().min(1).nullable(),
  input_digest: sha256Prefixed.nullable(),
  model_revision: revision.nullable(),
}).strict();

const embeddingData = z.object({
  model: z.string().min(1).nullable(),
  dimension: z.number().int().positive().nullable(),
  input_digest: sha256Prefixed.nullable(),
  embedding_digest: sha256Prefixed.nullable(),
  vector_ref: z.object({ kind: z.enum(['CANDIDATE_ORDINAL', 'QDRANT_POINT']), value: z.string().min(1) }).strict().nullable(),
}).strict();

const semanticData = z.object({
  summary: section(summaryData),
  embedding: section(embeddingData),
  keywords: z.array(z.string().min(1)),
  entities: z.array(z.string().min(1)),
  concept_ids: z.array(z.string().min(1)),
  domain_class: z.string().min(1).nullable(),
}).strict();

const topologyData = z.object({
  community_id: z.string().min(1).nullable(),
  pagerank: z.number().nonnegative().nullable(),
  som: z.object({ row: z.number().int().nonnegative(), col: z.number().int().nonnegative() }).strict().nullable(),
  kmeans_cluster: z.string().min(1).nullable(),
  centroid_refs: z.array(aceCentroidRefSchema),
}).strict();

const residencyData = z.object({
  tier: z.enum(['HOT', 'WARM', 'COLD']),
  lod: z.string().min(1),
  utility: z.number().nonnegative().nullable(),
  prefetch_reasons: z.array(z.string().min(1)),
  cache_identity_checksum: sha256Prefixed.nullable(),
}).strict();

/**
 * Structural facts from the existing owners (tree-sitter chunker structure + ast-grep observations). Deterministic
 * evidence only: no identity is minted here (symbol/tree-node identity stays in identity.*). Optional so sealed
 * packets composed before this section existed keep their checksum.
 */
const structuralData = z.object({
  provider: z.string().min(1).nullable(),
  provider_revision: revision.nullable(),
  symbols: z.array(z.object({
    name: z.string().min(1),
    kind: z.string().min(1),
    byte_start: z.number().int().nonnegative(),
    byte_end: z.number().int().nonnegative(),
  }).strict().refine((s) => s.byte_end > s.byte_start, { message: 'byte_end must be > byte_start' })),
  imports: z.array(z.string().min(1)),
  calls: z.array(z.string().min(1)),
  exports: z.array(z.string().min(1)),
  ast_grep_rule_ids: z.array(z.string().min(1)),
  structural_fact_refs: z.array(z.string().min(1)),
  symbol_nominations: z.array(structuralSymbolNominationSchema).optional(),
  reference_facts: z.array(structuralReferenceFactSchema).optional(),
  lsp_references: z.array(lspResolvedStructuralReferenceSchema).optional(),
}).strict();

const evidenceData = z.object({
  refs: z.array(z.string().min(1)),
  contradictions: z.array(z.string().min(1)),
  stale_refs: z.array(z.string().min(1)),
}).strict();

/**
 * Same identity surface as atlas.ace-packet.v2, but the hypergraph payload may be absent: most packets have no
 * relationship evidence yet, and an absent hypergraph must be representable rather than fabricated. A v2 packet is a
 * valid `base` as-is.
 */
export const aceBaseV3Schema = z.object({
  schema: z.literal('atlas.ace-packet.v2').optional(),
  packet_revision: revision,
  envelope: aceCanonicalEnvelopeProjectionSchema,
  hypergraph: aceHypergraphPayloadSchema.nullable(),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  const add = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const h = value.hypergraph;
  if (!h) return;
  if (value.envelope.packet_key !== h.packet_key) add('envelope.packet_key must match hypergraph.packet_key', ['hypergraph', 'packet_key']);
  if (value.envelope.source_ref !== h.source_ref) add('envelope.source_ref must match hypergraph.source_ref', ['hypergraph', 'source_ref']);
  if ((value.envelope.feature_id ?? null) !== (h.feature_id ?? null)) add('envelope.feature_id must match hypergraph.feature_id', ['hypergraph', 'feature_id']);
});

const acePacketV3Body = z.object({
  schema: z.literal('atlas.ace-packet.v3'),
  base: aceBaseV3Schema,
  identity: aceIdentityV3Schema,
  source: section(sourceData),
  semantic: section(semanticData),
  topology: section(topologyData),
  residency: section(residencyData),
  evidence: section(evidenceData),
  structural: section(structuralData).optional(),
}).strict();

function refine(value: z.infer<typeof acePacketV3Body>, ctx: z.RefinementCtx) {
  const add = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const env = value.base.envelope;
  if (value.identity.packet_key !== env.packet_key) add('identity.packet_key must equal base.envelope.packet_key', ['identity', 'packet_key']);
  if (value.identity.source_ref !== env.source_ref) add('identity.source_ref must equal base.envelope.source_ref', ['identity', 'source_ref']);
  if (env.source_revision && value.identity.source_revision !== env.source_revision) add('identity.source_revision must equal base.envelope.source_revision', ['identity', 'source_revision']);
  if (value.identity.packet_revision !== value.base.packet_revision) add('identity.packet_revision must equal base.packet_revision', ['identity', 'packet_revision']);

  const emb = value.semantic.data.embedding;
  if (emb.status === 'CURRENT') {
    if (!emb.data.input_digest || !emb.data.embedding_digest) add('a CURRENT embedding needs input_digest and embedding_digest', ['semantic', 'data', 'embedding', 'data']);
    if (!emb.data.vector_ref) add('a CURRENT embedding needs a vector_ref (vectors are referenced, not inlined)', ['semantic', 'data', 'embedding', 'data', 'vector_ref']);
    if (value.identity.representation_revision === null) add('a CURRENT embedding requires identity.representation_revision', ['identity', 'representation_revision']);
  }
  const summary = value.semantic.data.summary;
  if (summary.status === 'CURRENT' && (!summary.data.text || !summary.data.input_digest)) add('a CURRENT summary needs text and input_digest', ['semantic', 'data', 'summary', 'data']);
  if (value.structural?.status === 'CURRENT' && value.structural.data.provider_revision === null) add('a CURRENT structural section needs data.provider_revision', ['structural', 'data', 'provider_revision']);
  if (value.topology.status === 'CURRENT') {
    if (value.identity.graph_revision === null && value.identity.representation_revision === null) add('CURRENT topology needs identity.graph_revision or identity.representation_revision', ['identity']);
    for (const [i, ref] of value.topology.data.centroid_refs.entries()) {
      if (ref.representation_id !== value.identity.representation_id) add('centroid ref representation_id must equal identity.representation_id (no cross-representation collision)', ['topology', 'data', 'centroid_refs', i, 'representation_id']);
    }
  }
}

export const acePacketV3BodySchema = acePacketV3Body.superRefine(refine);
export const acePacketV3Schema = acePacketV3Body.extend({ integrity: z.object({ packet_checksum: sha256Prefixed }).strict() }).superRefine(refine).superRefine((value, ctx) => {
  const { integrity, ...body } = value;
  const expected = `sha256:${sha256HexV1(body)}`;
  if (integrity.packet_checksum !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'integrity.packet_checksum does not match the packet body', path: ['integrity', 'packet_checksum'] });
  }
});

export type AcePacketV3 = z.infer<typeof acePacketV3Schema>;
export type AcePacketV3BodyInput = z.input<typeof acePacketV3BodySchema>;

/** Validates the body (including cross-section rules) and seals it with a deterministic checksum. */
export function buildAcePacketV3(input: AcePacketV3BodyInput): AcePacketV3 {
  const body = acePacketV3BodySchema.parse({ ...input, schema: 'atlas.ace-packet.v3' });
  return acePacketV3Schema.parse({ ...body, integrity: { packet_checksum: `sha256:${sha256HexV1(body)}` } });
}

/**
 * Compose query-scoped, bounded HyperGraphRAG evidence onto an existing v3
 * packet. This does not run retrieval or persist the result. The snapshot and
 * canonical packet identity must match exactly; the packet is then resealed.
 */
export function attachHypergraphEvidenceToAcePacketV3(
  packetInput: unknown,
  hypergraphInput: unknown,
): AcePacketV3 {
  const packet = verifyAcePacketV3(packetInput);
  const hypergraph = aceHypergraphPayloadSchema.parse(hypergraphInput) as AceHypergraphPayloadV1;

  if (packet.identity.packet_key !== hypergraph.packet_key) {
    throw new Error('ACE3_HYPERGRAPH_PACKET_KEY_MISMATCH');
  }
  if (packet.identity.source_ref !== hypergraph.source_ref) {
    throw new Error('ACE3_HYPERGRAPH_SOURCE_REF_MISMATCH');
  }
  if ((packet.base.envelope.feature_id ?? null) !== (hypergraph.feature_id ?? null)) {
    throw new Error('ACE3_HYPERGRAPH_FEATURE_ID_MISMATCH');
  }
  if (packet.identity.workspace_revision !== hypergraph.lineage.source_snapshot_revision) {
    throw new Error('ACE3_HYPERGRAPH_WORKSPACE_REVISION_MISMATCH');
  }

  const { integrity: _integrity, ...body } = packet;
  return buildAcePacketV3({
    ...body,
    base: { ...body.base, hypergraph },
  });
}

/** Re-parses a stored packet and recomputes its checksum. Any mismatch throws; callers treat that as a cache MISS. */
export function verifyAcePacketV3(value: unknown): AcePacketV3 {
  return acePacketV3Schema.parse(value);
}
